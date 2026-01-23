import { StateGraph, START, END } from "@langchain/langgraph";
import { Skill, InspectionReport } from "../core/types.js";
import { createAgent } from "../agents/factory.js";
import { skillReader, fileExplorer, specLookup } from "../agents/tools.js";
import { getChatModel } from "../core/llm.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createSecuritySubgraph } from "./security.js";
import { InspectorAnnotation, InspectorState } from "./state.js";

/**
 * Compile the inspector graph
 */
export async function createInspectorGraph(llm: BaseChatModel) {
  // 1. Define Specialized Agents
  const specAgent = createAgent(
    llm,
    [specLookup, skillReader],
    `You are the Spec Validator. Your goal is to ensure the skill adheres strictly to agentskills.io.
    Check frontmatter, naming conventions, and description accuracy.
    Return findings as a JSON array: [{"severity": "low"|"medium"|"high", "message": "...", "fix": "..."}]`,
    "SpecAgent",
  );

  const securitySubgraph = await createSecuritySubgraph(llm);

  const compatAgent = createAgent(
    llm,
    [],
    `You are the Compatibility Expert. Check if the skill uses agent-specific extensions or patterns
    that might not work across different LLM providers (e.g. Claude-only XML tags).
    Return findings as a JSON array: [{"severity": "low"|"medium"|"high", "message": "...", "fix": "..."}]`,
    "CompatAgent",
  );

  // 2. Build the Graph
  const workflow = new StateGraph(InspectorAnnotation)
    .addNode("spec", specAgent)
    .addNode("security", securitySubgraph)
    .addNode("compatibility", compatAgent)
    .addEdge(START, "spec")
    .addEdge("spec", "security")
    .addEdge("security", "compatibility")
    .addEdge("compatibility", END);

  return workflow.compile();
}

/**
 * Orchestrator for sophisticated multi-agent inspection
 */
export async function runInspectorWorkflow(
  skill: Skill,
  model?: BaseChatModel,
  debug = false,
): Promise<InspectionReport> {
  const llm = model || (await getChatModel());
  const app = await createInspectorGraph(llm);

  const initialState = {
    skillPath: skill.path,
    skill,
    messages: [],
    findings: [],
    score: 100,
    errors: [],
    model: llm,
    debug,
  };

  const finalState = (await app.invoke(initialState)) as InspectorState;

  // 3. Post-processing Score (Heuristic)
  let finalScore = 100;
  for (const f of finalState.findings) {
    if (f.severity === "critical") finalScore -= 50;
    else if (f.severity === "high") finalScore -= 25;
    else if (f.severity === "medium") finalScore -= 10;
    else if (f.severity === "low") finalScore -= 2;
  }

  return {
    skillName: skill.name,
    overallScore: Math.max(0, finalScore),
    findings: finalState.findings,
    summary:
      finalState.findings.length === 0
        ? "No issues found. Skill looks safe and compliant."
        : `Found ${finalState.findings.length} potential issues across multiple agents.`,
    timestamp: new Date().toISOString(),
  };
}
