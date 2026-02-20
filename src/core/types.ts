import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string(),
  fix: z.string().optional(),
  agent: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export interface InspectorModelConfig {
  provider: string;
  name: string;
  apiKey?: string;
  modelInstance?: unknown;
  [key: string]: unknown;
}

export const SkillSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  content: z.string(),
});

export interface Skill {
  name: string;
  path: string;
  description: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface InspectionReport {
  skillName: string;
  overallScore: number;
  /** Present on incomplete reports: [pessimistic, optimistic] score bounds */
  scoreRange?: { min: number; max: number };
  /** Points deducted per agent category after per-category caps are applied */
  scoreBreakdown?: { security: number; spec: number; compat: number };
  findings: Array<Finding>;
  summary: string;
  timestamp: string;
  incomplete?: boolean;
  failedSteps?: Array<string>;
  errors?: Array<string>;
}

/**
 * Base state for the inspector workflow
 */
export interface InspectorState {
  skillPath: string;
  skill?: Skill;
  findings: Array<Finding>;
  score: number;
  report?: InspectionReport;
  errors: Array<string>;
  debug?: boolean;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
