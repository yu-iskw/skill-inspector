import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StructuredTool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { createAgent as langchainCreateAgent } from "langchain";
import { InspectorState, Finding } from "../core/types.js";
import { z } from "zod";

/**
 * Finding from an agent (raw from LLM)
 */
interface RawAgentFinding {
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  fix?: string;
}

/**
 * Helper to create an agent node for LangGraph using the official createAgent API.
 */
export function createAgent(
  llm: BaseChatModel,
  tools: StructuredTool[],
  systemPrompt: string,
  agentName: string,
) {
  const agent = langchainCreateAgent({
    model: llm,
    tools,
    systemPrompt: `${systemPrompt}\n\nAlways report your findings using the required structured output format.`,
    responseFormat: z.object({
      findings: z.array(
        z.object({
          severity: z.enum(["low", "medium", "high", "critical"]),
          message: z.string(),
          fix: z
            .string()
            .describe("Proposed fix if available, or empty string"),
        }),
      ),
    }),
  });

  return async (state: InspectorState): Promise<Partial<InspectorState>> => {
    const inputMessages = [...state.messages];

    // If no messages yet, inject the skill content for analysis
    if (inputMessages.length === 0 && state.skill) {
      inputMessages.push(
        new HumanMessage(
          `Analyzing skill: ${state.skill.name}\nPath: ${state.skillPath}\nContent: ${state.skill.content.slice(0, 5000)}...`,
        ),
      );
    }

    if (state.debug) {
      console.log(`\n[${agentName}] Starting analysis...`);
    }

    try {
      const result = await agent.invoke({
        messages: inputMessages,
      });

      // Extract findings from the structured response and add the agent name
      const structuredResponse = result.structuredResponse as
        | { findings: RawAgentFinding[] }
        | undefined;
      const newFindings: Finding[] = (structuredResponse?.findings || []).map(
        (f) => ({
          ...f,
          agent: agentName,
        }),
      );

      if (state.debug) {
        console.log(
          `[${agentName}] Analysis complete. Found ${newFindings.length} issues.`,
        );
      }

      // We return ONLY the new findings and the new messages.
      // LangGraph's reducer will merge them into the state.
      // Note: result.messages includes the full conversation history from this agent run.
      // We want to return the new messages produced during this run.
      const newMessages = result.messages.slice(inputMessages.length);

      return {
        findings: newFindings,
        messages: newMessages,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (state.debug) {
        console.error(`[${agentName}] Error:`, error);
      }
      return {
        errors: [`Agent ${agentName} failed: ${errorMessage}`],
      };
    }
  };
}
