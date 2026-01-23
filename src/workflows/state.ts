import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { Skill, Finding, InspectionReport } from "../core/types.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

/**
 * Inspector state annotation using LangGraph v1 Root Annotation.
 * Centralizes channel definitions and reducers for consistent state management
 * across orchestrator and subgraphs.
 */
export const InspectorAnnotation = Annotation.Root({
  /**
   * Inherit standard message state (messages channel with reducer)
   */
  ...MessagesAnnotation.spec,

  /**
   * Path to the skill being inspected
   */
  skillPath: Annotation<string>({
    reducer: (a, b) => b ?? a,
    default: () => "",
  }),

  /**
   * The skill object itself
   */
  skill: Annotation<Skill | undefined>({
    reducer: (a, b) => b ?? a,
  }),

  /**
   * Aggregate findings from all agents
   */
  findings: Annotation<Finding[]>({
    reducer: (a, b) => [...(a || []), ...(b || [])],
    default: () => [],
  }),

  /**
   * Heuristic score (0-100)
   */
  score: Annotation<number>({
    reducer: (a, b) => Math.min(a, b),
    default: () => 100,
  }),

  /**
   * Final inspection report, if generated
   */
  report: Annotation<InspectionReport | undefined>({
    reducer: (a, b) => b ?? a,
  }),

  /**
   * Aggregate errors encountered during inspection
   */
  errors: Annotation<string[]>({
    reducer: (a, b) => [...(a || []), ...(b || [])],
    default: () => [],
  }),

  /**
   * The LLM being used for this workflow
   */
  model: Annotation<BaseChatModel | undefined>({
    reducer: (a, b) => b ?? a,
  }),

  /**
   * Debug flag for verbose logging
   */
  debug: Annotation<boolean | undefined>({
    reducer: (a, b) => b ?? a,
  }),

  /**
   * Aggregate token usage across all agents
   */
  usage: Annotation<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>({
    reducer: (a, b) => {
      if (!a) return b;
      if (!b) return a;
      return {
        promptTokens: (a.promptTokens || 0) + (b.promptTokens || 0),
        completionTokens: (a.completionTokens || 0) + (b.completionTokens || 0),
        totalTokens: (a.totalTokens || 0) + (b.totalTokens || 0),
      };
    },
    default: () => ({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }),
  }),
});

/**
 * Type derived from the InspectorAnnotation
 */
export type InspectorState = typeof InspectorAnnotation.State;
