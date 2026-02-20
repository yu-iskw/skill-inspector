import { Mastra } from "@mastra/core";
import { z } from "zod";
import path from "node:path";
import {
  Skill,
  InspectionReport,
  Finding,
  InspectorModelConfig,
} from "../core/types.js";
import {
  createInspectorAgent,
  InspectionOutputSchema,
  generateWithStructuredOutput,
} from "../agents/factory.js";
import { getModelConfig, LLMConfig } from "../core/llm.js";
import { createSecurityWorkflow } from "./security.js";
import { validateSpec } from "../core/validators.js";
import { logger } from "../core/logger.js";

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

const SEVERITY_DEDUCTIONS: Record<string, number> = {
  critical: 50,
  high: 25,
  medium: 10,
  low: 2,
};

/** Maximum points each agent category can deduct from the total score */
const AGENT_CAPS = {
  security: 65, // SecurityExplorer + SecurityAuditor combined
  spec: 25, // SpecValidator
  compat: 15, // CompatAgent
} as const;

type AgentCategory = keyof typeof AGENT_CAPS;

function classifyAgent(agent: string | undefined): AgentCategory {
  if (!agent) return "security";
  const a = agent.toLowerCase();
  if (a.includes("security") || a.startsWith("security")) return "security";
  if (a === "specvalidator") return "spec";
  if (a === "compatagent") return "compat";
  return "security"; // unknown agents fall into security bucket
}

/**
 * Normalized scoring with per-category caps.
 *
 * For complete inspections returns a single score.
 * For incomplete inspections also returns a scoreRange:
 *   - max = optimistic (failed steps found nothing)
 *   - min = pessimistic (failed steps would have maxed their cap)
 */
function calculateNormalizedScore(
  findings: Array<Finding>,
  failedSteps: Array<string>,
): {
  score: number;
  scoreRange?: { min: number; max: number };
  scoreBreakdown: { security: number; spec: number; compat: number };
} {
  // Accumulate raw deductions per category
  const raw: Record<AgentCategory, number> = { security: 0, spec: 0, compat: 0 };
  for (const f of findings) {
    const cat = classifyAgent(f.agent);
    raw[cat] += SEVERITY_DEDUCTIONS[f.severity] ?? 0;
  }

  // Apply per-category caps
  const capped = {
    security: Math.min(raw.security, AGENT_CAPS.security),
    spec: Math.min(raw.spec, AGENT_CAPS.spec),
    compat: Math.min(raw.compat, AGENT_CAPS.compat),
  };

  const totalDeduction = capped.security + capped.spec + capped.compat;
  const optimisticScore = Math.max(0, 100 - totalDeduction);

  if (failedSteps.length > 0) {
    // Pessimistic: assume each failed step would have maxed out its cap
    let pessimisticExtra = 0;
    for (const step of failedSteps) {
      const s = step.toLowerCase();
      if (s.includes("security")) {
        pessimisticExtra += AGENT_CAPS.security - capped.security;
      } else if (s.includes("compat")) {
        pessimisticExtra += AGENT_CAPS.compat - capped.compat;
      } else if (s.includes("spec")) {
        pessimisticExtra += AGENT_CAPS.spec - capped.spec;
      }
    }
    const pessimisticScore = Math.max(0, optimisticScore - pessimisticExtra);
    return {
      score: pessimisticScore,
      scoreRange: { min: pessimisticScore, max: optimisticScore },
      scoreBreakdown: capped,
    };
  }

  return { score: optimisticScore, scoreBreakdown: capped };
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

type StepResult = { findings: Array<Finding>; failed?: boolean; error?: string };

async function runWithTimeout(
  promise: Promise<StepResult>,
  timeoutMs: number,
  stepName: string,
): Promise<StepResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<StepResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          findings: [],
          failed: true,
          error: `Step '${stepName}' timed out after ${timeoutMs}ms`,
        }),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Step helpers — each returns a StepResult independently
// ---------------------------------------------------------------------------

async function runSecurityCheck(
  modelConfig: InspectorModelConfig,
  skill: Skill,
): Promise<StepResult> {
  try {
    const secWorkflow = createSecurityWorkflow(
      modelConfig,
      path.dirname(skill.path),
    );
    const mastra = new Mastra({ workflows: { "security-audit": secWorkflow } });
    const workflow = mastra.getWorkflow("security-audit");
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: { skillPath: skill.path, skillContent: skill.content },
    });

    const allFindings: Array<Finding> = [];
    const failedNames: Array<string> = [];
    const errors: Array<string> = [];
    const steps = result.steps as Record<
      string,
      {
        output?: {
          findings?: Array<Finding>;
          failed?: boolean;
          error?: string;
        };
      }
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
      if (stepResult?.output?.failed) {
        failedNames.push(`security.${stepName}`);
        if (stepResult.output.error) {
          errors.push(`security.${stepName}: ${stepResult.output.error}`);
        }
      }
    }

    if (failedNames.length > 0) {
      return {
        findings: allFindings,
        failed: true,
        error: errors.join("; "),
      };
    }
    return { findings: allFindings };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error(
      "Error in security check",
      error instanceof Error ? error : new Error(errorMessage),
    );
    return { findings: [], failed: true, error: errorMessage };
  }
}

async function runCompatCheck(
  modelConfig: InspectorModelConfig,
  skill: Skill,
): Promise<StepResult> {
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

  try {
    const result = await generateWithStructuredOutput(
      compatAgent,
      `Check compatibility for the skill. Content:\n${skill.content}`,
      InspectionOutputSchema,
      modelConfig,
      false,
    );
    return {
      findings: result.findings.map((f) => ({ ...f, agent: "CompatAgent" })),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error(
      "Error in compatibility check",
      error instanceof Error ? error : new Error(errorMessage),
    );
    return { findings: [], failed: true, error: errorMessage };
  }
}

// ---------------------------------------------------------------------------
// Public orchestrator
// ---------------------------------------------------------------------------

// Keep schema export for tests that may reference it
export const StepOutputSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      message: z.string(),
      fix: z.string().optional(),
      agent: z.string().optional(),
    }),
  ),
  failed: z.boolean().optional(),
  error: z.string().optional(),
});

/**
 * Run the full inspection pipeline for a single skill.
 *
 * Steps:
 *  1. Spec validation (synchronous, no LLM)
 *  2. Security check  ─┐ run in parallel
 *  3. Compat check    ─┘ with per-step timeout
 */
export async function runInspectorWorkflow(
  skill: Skill,
  debug = false,
  llmConfig?: Partial<LLMConfig>,
  timeoutMs = 120_000,
): Promise<InspectionReport> {
  const modelConfig = getModelConfig(llmConfig);

  // Step 1: deterministic spec validation (no LLM, no timeout needed)
  const specFindings = validateSpec(skill).map((f) => ({
    ...f,
    agent: f.agent ?? "SpecValidator",
  }));

  logger.debug("Spec validation complete", {
    findings: specFindings.length,
  });

  // Steps 2 & 3: run security and compat in parallel, each with a timeout
  logger.debug(
    `Running security and compat checks in parallel (timeout: ${timeoutMs}ms)`,
  );

  const [securityResult, compatResult] = await Promise.all([
    runWithTimeout(runSecurityCheck(modelConfig, skill), timeoutMs, "security"),
    runWithTimeout(runCompatCheck(modelConfig, skill), timeoutMs, "compatibility"),
  ]);

  logger.debug("Parallel checks complete", {
    securityFailed: securityResult.failed,
    compatFailed: compatResult.failed,
  });

  // Combine all findings
  const allFindings: Array<Finding> = [
    ...specFindings,
    ...(securityResult.findings ?? []),
    ...(compatResult.findings ?? []),
  ];

  // Collect failed steps and errors
  const failedSteps: Array<string> = [];
  const errors: Array<string> = [];
  if (securityResult.failed) {
    failedSteps.push("security");
    if (securityResult.error) errors.push(`security: ${securityResult.error}`);
  }
  if (compatResult.failed) {
    failedSteps.push("compatibility");
    if (compatResult.error)
      errors.push(`compatibility: ${compatResult.error}`);
  }

  const incomplete = failedSteps.length > 0;

  // Normalized scoring with per-category caps
  const { score, scoreRange, scoreBreakdown } = calculateNormalizedScore(
    allFindings,
    failedSteps,
  );

  const summaryText = incomplete
    ? `Inspection incomplete: ${failedSteps.length} step(s) failed. Score shown is pessimistic lower bound.`
    : allFindings.length === 0
      ? "No issues found. Skill looks safe and compliant."
      : `Found ${allFindings.length} potential issue(s) across multiple agents.`;

  return {
    skillName: skill.name,
    overallScore: score,
    scoreRange,
    scoreBreakdown,
    findings: allFindings,
    summary: summaryText,
    timestamp: new Date().toISOString(),
    incomplete,
    failedSteps: incomplete ? failedSteps : undefined,
    errors: incomplete && errors.length > 0 ? errors : undefined,
  };
}
