import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  createInspectorAgent,
  InspectionOutputSchema,
} from "../agents/factory.js";
import { securityAgentInstructions } from "../agents/security.js";
import { createFileExplorer, createSkillReader } from "../agents/tools.js";
import { FindingSchema, InspectorModelConfig } from "../core/types.js";

const SecurityStepOutputSchema = z.object({
  findings: z.array(FindingSchema),
});

export function createSecurityWorkflow(
  model: InspectorModelConfig,
  skillDir: string,
) {
  const explorerAgent = createInspectorAgent({
    name: "SecurityExplorer",
    instructions: `You are the Security Explorer. Your job is to silently scan the skill's file structure for anomalies.

    RULES:
    1. **Silence by Default**: If the skill structure is standard (e.g., \`SKILL.md\` + \`scripts/*.py\` + \`assets/\`), do NOT generate any findings.
    2. **Anomalies Only**: ONLY generate a Finding if you detect:
       - Hidden files or directories (starting with \`.\`).
       - Obfuscated or suspicious filenames (e.g., \`.._confnfused.py\`, \`0x123.bin\`).
       - Files with unusual executable extensions (e.g., \`.exe\`, \`.dll\`, \`.sh\`, \`.so\`) found **outside** the \`scripts/\` directory.
    3. **No Informational Findings**: Do not report "List of scripts" or "Documentation references" as findings. Those are not security issues.

    NOTE: The existence of \`scripts/\`, \`assets/\`, and \`references/\` is standard and should be ignored if they contain expected file types.`,
    model,
    tools: {
      fileExplorer: createFileExplorer(skillDir),
      skillReader: createSkillReader(skillDir),
    },
  });

  const auditorAgent = createInspectorAgent({
    name: "SecurityAuditor",
    instructions: securityAgentInstructions,
    model,
    tools: { skillReader: createSkillReader(skillDir) },
  });

  const exploreStep = createStep({
    id: "explore",
    inputSchema: z.object({
      skillPath: z.string(),
      skillContent: z.string(),
    }),
    outputSchema: SecurityStepOutputSchema,
    execute: async ({ inputData }) => {
      const result = await explorerAgent.generate(
        `Explore the skill at ${inputData.skillPath}. Content:\n${inputData.skillContent}`,
        {
          structuredOutput: {
            schema: InspectionOutputSchema,
          },
        },
      );
      return { findings: result.object.findings };
    },
  });

  const auditStep = createStep({
    id: "audit",
    inputSchema: SecurityStepOutputSchema, // Accept output from explore
    outputSchema: SecurityStepOutputSchema,
    execute: async ({ inputData, getInitData }) => {
      const { skillContent } = getInitData<{
        skillPath: string;
        skillContent: string;
      }>();
      const explorationFindings = inputData.findings || [];
      const result = await auditorAgent.generate(
        `Audit the skill. Exploration findings: ${JSON.stringify(explorationFindings)}\nContent:\n${skillContent}`,
        {
          structuredOutput: {
            schema: InspectionOutputSchema,
          },
        },
      );
      return { findings: result.object.findings };
    },
  });

  const securityWorkflow = createWorkflow({
    id: "security-audit",
    inputSchema: z.object({
      skillPath: z.string(),
      skillContent: z.string(),
    }),
    outputSchema: SecurityStepOutputSchema,
  });

  securityWorkflow.then(exploreStep).then(auditStep).commit();

  return securityWorkflow;
}
