import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  createInspectorAgent,
  InspectionOutputSchema,
} from "../agents/factory.js";
import { fileExplorer, skillReader } from "../agents/tools.js";
import { FindingSchema, InspectorModelConfig } from "../core/types.js";

const SecurityStepOutputSchema = z.object({
  findings: z.array(FindingSchema),
});

export function createSecurityWorkflow(model: InspectorModelConfig) {
  const explorerAgent = createInspectorAgent({
    name: "SecurityExplorer",
    instructions: `You are the Security Explorer. Your job is to map out the skill's environment.
    Identify all scripts, external dependencies, and potential attack vectors.
    Look for hidden files or obfuscated code.`,
    model,
    tools: { fileExplorer, skillReader },
  });

  const auditorAgent = createInspectorAgent({
    name: "SecurityAuditor",
    instructions: `You are the Security Auditor. Review the findings from the Explorer and the skill content.
    Identify specific vulnerabilities like RCE, Data Exfiltration, or Secret Theft.
    Provide detailed findings with severity.`,
    model,
    tools: { skillReader },
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
