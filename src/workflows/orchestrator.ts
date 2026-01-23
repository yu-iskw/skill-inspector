import { createWorkflow, createStep } from "@mastra/core/workflows";
import { Mastra } from "@mastra/core";
import { z } from "zod";
import path from "node:path";
import {
  Skill,
  SkillSchema,
  InspectionReport,
  Finding,
  FindingSchema,
  InspectorModelConfig,
} from "../core/types.js";
import {
  createInspectorAgent,
  InspectionOutputSchema,
} from "../agents/factory.js";
import { getModelConfig, LLMConfig } from "../core/llm.js";
import { createSecurityWorkflow } from "./security.js";
import { validateSpec } from "../core/validators.js";

const StepOutputSchema = z.object({
  findings: z.array(FindingSchema),
});

/**
 * Create the main inspector workflow using Mastra
 */
export function createInspectorWorkflow(
  modelConfig: InspectorModelConfig,
  skill: Skill,
) {
  const compatAgent = createInspectorAgent({
    name: "CompatAgent",
    instructions: `You are the Compatibility Expert. Your goal is to ensure the skill is portable across different LLM providers (e.g., Claude, GPT-4, Gemini), adhering to the OPEN Agent Skills standard (agentskills.io).

    RULES:
    1. The \`SKILL.md\` format (frontmatter + markdown) and directory structure (\`scripts/\`, \`assets/\`) is an OPEN STANDARD. Do NOT flag the use of this format as "Claude-specific" or "vendor-locked".
    2. Flag usage of vendor-specific prompts or XML tags ONLY if they degrade functionality on other models (e.g. strict reliance on specific <antThinking> tags without fallback).
    3. Flag hardcoded reliance on specific OS binaries (e.g., 'requires apt-get') UNLESS specified in the \`compatibility\` frontmatter field.
    4. If the skill uses standard Markdown, Python, or Bash, it is likely Compatible. Report NO issues in that case.`,
    model: modelConfig,
  });

  const securityWorkflow = createSecurityWorkflow(
    modelConfig,
    path.dirname(skill.path),
  );

  const specStep = createStep({
    id: "spec",
    inputSchema: z.object({
      skill: SkillSchema,
      debug: z.boolean().optional(),
    }),
    outputSchema: StepOutputSchema,
    execute: async ({ getInitData }) => {
      const { skill } = getInitData<{ skill: Skill }>();
      const findings = validateSpec(skill);
      return { findings };
    },
  });

  const securityStep = createStep({
    id: "security",
    inputSchema: StepOutputSchema,
    outputSchema: StepOutputSchema,
    execute: async ({ getInitData }) => {
      const { skill } = getInitData<{ skill: Skill }>();
      const run = await securityWorkflow.createRun();
      const result = await run.start({
        inputData: {
          skillPath: skill.path,
          skillContent: skill.content,
        },
      });

      const allFindings: Finding[] = [];
      const steps = result.steps as Record<
        string,
        { output?: { findings?: Finding[] } }
      >;

      for (const stepName in steps) {
        const stepResult = steps[stepName];
        if (stepResult?.output?.findings) {
          allFindings.push(
            ...stepResult.output.findings.map((f) => ({
              ...f,
              agent:
                f.agent ||
                `Security${stepName.charAt(0).toUpperCase()}${stepName.slice(1)}`,
            })),
          );
        }
      }

      return { findings: allFindings };
    },
  });

  const compatStep = createStep({
    id: "compatibility",
    inputSchema: StepOutputSchema,
    outputSchema: StepOutputSchema,
    execute: async ({ getInitData }) => {
      const { skill } = getInitData<{ skill: Skill }>();
      const result = await compatAgent.generate(
        `Check compatibility for the skill. Content:\n${skill.content}`,
        {
          structuredOutput: {
            schema: InspectionOutputSchema,
          },
        },
      );
      return {
        findings: result.object.findings.map((f) => ({
          ...f,
          agent: "CompatAgent",
        })),
      };
    },
  });

  const mainWorkflow = createWorkflow({
    id: "skill-inspector-main",
    inputSchema: z.object({
      skill: SkillSchema,
      debug: z.boolean().optional(),
    }),
    outputSchema: z.object({
      findings: z.array(FindingSchema),
    }),
  });

  mainWorkflow.then(specStep).then(securityStep).then(compatStep).commit();

  return { mainWorkflow, securityWorkflow };
}

/**
 * Orchestrator to run the inspection
 */
export async function runInspectorWorkflow(
  skill: Skill,
  debug = false,
  llmConfig?: Partial<LLMConfig>,
): Promise<InspectionReport> {
  const modelConfig = getModelConfig(llmConfig);
  const { mainWorkflow, securityWorkflow } = createInspectorWorkflow(
    modelConfig,
    skill,
  );

  const mastra = new Mastra({
    workflows: {
      "skill-inspector-main": mainWorkflow,
      "security-audit": securityWorkflow,
    },
  });

  const workflow = mastra.getWorkflow("skill-inspector-main");
  const run = await workflow.createRun();
  const result = await run.start({
    inputData: {
      skill,
      debug,
    },
  });

  const allFindings: Finding[] = [];
  const steps = result.steps as Record<
    string,
    { output?: { findings?: Finding[] } }
  >;

  for (const stepName in steps) {
    const stepResult = steps[stepName];
    if (stepResult?.output?.findings) {
      allFindings.push(...stepResult.output.findings);
    }
  }

  let finalScore = 100;
  for (const f of allFindings) {
    if (f.severity === "critical") finalScore -= 50;
    else if (f.severity === "high") finalScore -= 25;
    else if (f.severity === "medium") finalScore -= 10;
    else if (f.severity === "low") finalScore -= 2;
  }

  return {
    skillName: skill.name,
    overallScore: Math.max(0, finalScore),
    findings: allFindings,
    summary:
      allFindings.length === 0
        ? "No issues found. Skill looks safe and compliant."
        : `Found ${allFindings.length} potential issues across multiple agents.`,
    timestamp: new Date().toISOString(),
  };
}
