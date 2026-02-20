import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  createInspectorAgent,
  InspectionOutputSchema,
  generateWithStructuredOutput,
} from "../agents/factory.js";
import { securityAgentInstructions } from "../agents/security.js";
import {
  createFileExplorer,
  createFileReader,
  createSkillReader,
} from "../agents/tools.js";
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
    instructions: `You are the Security Explorer. Your job is to scan the skill's file structure AND file contents for security anomalies.

    STEPS:
    1. Use \`fileExplorer\` to list all files and directories in the skill directory.
    2. For each non-SKILL.md file found (especially in \`scripts/\`, \`assets/\`, etc.), use \`fileReader\` to read its contents and inspect for malicious code, hardcoded secrets, or obfuscated payloads.

    RULES:
    1. **Silence by Default**: If all files look standard and their contents are benign, return an empty findings array.
    2. **Anomalies Only**: ONLY generate a Finding if you detect:
       - Hidden files or directories (starting with \`.\`).
       - Obfuscated or suspicious filenames (e.g., \`.._confused.py\`, \`0x123.bin\`).
       - Files with unusual executable extensions (e.g., \`.exe\`, \`.dll\`, \`.so\`) found **outside** the \`scripts/\` directory.
       - **Script contents that delete files (\`rm -rf\`), exfiltrate data (\`curl\` to external hosts), or execute remote code (\`curl | bash\`).**
       - **Hardcoded secrets (API keys, passwords, tokens) in any file.**
       - **Base64-encoded or otherwise obfuscated payloads in any file.**
    3. Do not report the existence of \`scripts/\`, \`assets/\`, or \`references/\` as findings.

    NOTE: \`scripts/\` is a standard directory. The existence of shell scripts is NOT suspicious — only their *contents* matter.`,
    model,
    tools: {
      fileExplorer: createFileExplorer(skillDir),
      fileReader: createFileReader(skillDir),
      skillReader: createSkillReader(skillDir),
    },
  });

  const auditorAgent = createInspectorAgent({
    name: "SecurityAuditor",
    instructions: `${securityAgentInstructions}

You also have access to a \`fileReader\` tool. If the skill references external scripts or the explorer found any files, use \`fileReader\` to read their raw content before making your final judgement.`,
    model,
    tools: {
      skillReader: createSkillReader(skillDir),
      fileReader: createFileReader(skillDir),
    },
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
          `Audit the skill for security issues. If scripts or other files were identified during exploration, use the fileReader tool to inspect their contents before drawing conclusions.\n\nExploration findings: ${JSON.stringify(explorationFindings)}\nSKILL.md content:\n${skillContent}`,
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
