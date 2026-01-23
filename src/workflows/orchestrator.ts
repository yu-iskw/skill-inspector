import { createWorkflow, createStep } from "@mastra/core/workflows";
import { Mastra } from "@mastra/core";
import { z } from "zod";
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
import { skillReader, specLookup } from "../agents/tools.js";
import { getModelConfig, LLMConfig } from "../core/llm.js";
import { createSecurityWorkflow } from "./security.js";

const StepOutputSchema = z.object({
  findings: z.array(FindingSchema),
});

/**
 * Create the main inspector workflow using Mastra
 */
export function createInspectorWorkflow(modelConfig: InspectorModelConfig) {
  const specAgent = createInspectorAgent({
    name: "SpecAgent",
    instructions: `You are the Spec Validator. Your goal is to ensure the skill adheres strictly to agentskills.io.
    Check frontmatter, naming conventions, and description accuracy.`,
    model: modelConfig,
    tools: { specLookup, skillReader },
  });

  const compatAgent = createInspectorAgent({
    name: "CompatAgent",
    instructions: `You are the Compatibility Expert. Check if the skill uses agent-specific extensions or patterns
    that might not work across different LLM providers (e.g. Claude-only XML tags).`,
    model: modelConfig,
  });

  const securityWorkflow = createSecurityWorkflow(modelConfig);

  const specStep = createStep({
    id: "spec",
    inputSchema: z.object({
      skill: SkillSchema,
      debug: z.boolean().optional(),
    }),
    outputSchema: StepOutputSchema,
    execute: async ({ getInitData }) => {
      const { skill } = getInitData<{ skill: Skill }>();
      const result = await specAgent.generate(
        `Validate the skill at ${skill.path}. Content:\n${skill.content}`,
        {
          structuredOutput: {
            schema: InspectionOutputSchema,
          },
        },
      );
      return {
        findings: result.object.findings.map((f) => ({
          ...f,
          agent: "SpecAgent",
        })),
      };
    },
  });

  const securityStep = createStep({
    id: "security",
    inputSchema: StepOutputSchema,
    outputSchema: StepOutputSchema,
    execute: async ({ getInitData, mastra }) => {
      const { skill } = getInitData<{ skill: Skill }>();
      const securityWorkflow = mastra!.getWorkflow("security-audit");
      const run = await securityWorkflow.createRun();
      const result = await run.start({
        inputData: {
          skillPath: skill.path,
          skillContent: skill.content,
        },
      });

      const allFindings: Finding[] = [];
      const steps = result.steps as Record<string, any>;
      if (steps.explore?.output?.findings) {
        allFindings.push(
          ...steps.explore.output.findings.map((f: any) => ({
            ...f,
            agent: "SecurityExplorer",
          })),
        );
      }
      if (steps.audit?.output?.findings) {
        allFindings.push(
          ...steps.audit.output.findings.map((f: any) => ({
            ...f,
            agent: "SecurityAuditor",
          })),
        );
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
  const { mainWorkflow, securityWorkflow } =
    createInspectorWorkflow(modelConfig);

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
  const steps = result.steps as Record<string, any>;
  if (steps?.spec?.output?.findings)
    allFindings.push(...steps.spec.output.findings);
  if (steps?.security?.output?.findings)
    allFindings.push(...steps.security.output.findings);
  if (steps?.compatibility?.output?.findings)
    allFindings.push(...steps.compatibility.output.findings);

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
