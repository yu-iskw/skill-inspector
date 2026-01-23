import { StateGraph, START, END } from "@langchain/langgraph";
import { createAgent } from "../agents/factory.js";
import { fileExplorer, skillReader } from "../agents/tools.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { InspectorAnnotation } from "./state.js";

/**
 * Security Deep Dive Subgraph
 * Uses Evaluator-Optimizer pattern for rigorous security analysis.
 */
export async function createSecuritySubgraph(llm: BaseChatModel) {
  const explorerAgent = createAgent(
    llm,
    [fileExplorer, skillReader],
    `You are the Security Explorer. Your job is to map out the skill's environment.
    Identify all scripts, external dependencies, and potential attack vectors.
    Look for hidden files or obfuscated code.`,
    "SecurityExplorer",
  );

  const auditorAgent = createAgent(
    llm,
    [skillReader],
    `You are the Security Auditor. Review the findings from the Explorer and the skill content.
    Identify specific vulnerabilities like RCE, Data Exfiltration, or Secret Theft.
    Provide detailed findings with severity.`,
    "SecurityAuditor",
  );

  const evaluatorAgent = createAgent(
    llm,
    [],
    `You are the Security Evaluator. Your job is to review the Auditor's findings.
    Are they accurate? Did they miss anything? Is the severity appropriate?
    If the audit is incomplete, send it back for improvement.
    If approved, finalize the security report.`,
    "SecurityEvaluator",
  );

  const workflow = new StateGraph(InspectorAnnotation)
    .addNode("explore", explorerAgent)
    .addNode("audit", auditorAgent)
    .addNode("evaluate", evaluatorAgent)
    .addEdge(START, "explore")
    .addEdge("explore", "audit")
    .addEdge("audit", "evaluate")
    // Logic for Evaluator-Optimizer could be a conditional edge
    .addConditionalEdges(
      "evaluate",
      (state) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (
          lastMessage &&
          typeof lastMessage.content === "string" &&
          lastMessage.content.includes("NEEDS_REVISION")
        ) {
          return "audit";
        }
        return END;
      },
      {
        audit: "audit",
        [END]: END,
      },
    );

  return workflow.compile();
}
