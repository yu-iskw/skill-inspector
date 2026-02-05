import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  createInspectorAgent,
  InspectionOutputSchema,
  generateWithStructuredOutput,
} from "../agents/factory.js";
import { securityAgentInstructions } from "../agents/security.js";
import { createFileExplorer, createSkillReader } from "../agents/tools.js";
import { FindingSchema, InspectorModelConfig } from "../core/types.js";
import { logger } from "../core/logger.js";

const SecurityStepOutputSchema = z.object({
  findings: z.array(FindingSchema),
  failed: z.boolean().optional(),
  error: z.string().optional(),
});

export function createSecurityWorkflow(
  model: InspectorModelConfig,
  skillDir: string,
) {
  const explorerAgent = createInspectorAgent({
    name: "SecurityExplorer",
    instructions: `You are the Security Explorer. Your job is to silently scan the skill's file structure for anomalies.

    RULES:
    1. **Silence by Default**: If the skill structure is standard (e.g., \`SKILL.md\` + \`scripts/*.py\` + \`assets/\`), do NOT generate any findings (return an empty array).
    2. **Anomalies Only**: ONLY generate a Finding if you detect:
       - Hidden files or directories (starting with \`.\`).
       - Obfuscated or suspicious filenames (e.g., \`.._confnfused.py\`, \`0x123.bin\`).
       - Files with unusual executable extensions (e.g., \`.exe\`, \`.dll\`, \`.sh\`, \`.so\`) found **outside** the \`scripts/\` directory.
    3. **No Informational Findings**: Do not report "List of scripts" or "Documentation references" as findings. Those are not security issues. If no anomalies are found, return an empty findings array.

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
      try {
        const result = await generateWithStructuredOutput(
          explorerAgent,
          `Explore the skill at ${inputData.skillPath}. Content:\n${inputData.skillContent}`,
          InspectionOutputSchema,
          model,
          true, // has tools (fileExplorer, skillReader)
        );
        return { findings: result.findings };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `Error in security explore step for ${inputData.skillPath}`,
          error instanceof Error ? error : new Error(errorMessage),
        );
        return {
          findings: [],
          failed: true,
          error: errorMessage,
        };
      }
    },
  });

  const auditStep = createStep({
    id: "audit",
    inputSchema: SecurityStepOutputSchema, // Accept output from explore
    outputSchema: SecurityStepOutputSchema,
    execute: async ({ inputData, getInitData }) => {
      try {
        const { skillContent } = getInitData<{
          skillPath: string;
          skillContent: string;
        }>();
        const explorationFindings = inputData.findings || [];
        const result = await generateWithStructuredOutput(
          auditorAgent,
          `Audit the skill. Exploration findings: ${JSON.stringify(explorationFindings)}\nContent:\n${skillContent}`,
          InspectionOutputSchema,
          model,
          true, // has tools (skillReader)
        );
        return { findings: result.findings };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          "Error in security audit step",
          error instanceof Error ? error : new Error(errorMessage),
        );
        return {
          findings: [],
          failed: true,
          error: errorMessage,
        };
      }
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
