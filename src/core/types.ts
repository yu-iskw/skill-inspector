import { z } from "zod";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage } from "@langchain/core/messages";

/**
 * Zod schema for SKILL.md frontmatter
 */
export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9-]+$/,
      "Name must be lowercase letters, numbers, and hyphens only",
    ),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  "allowed-tools": z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

/**
 * Internal representation of a Skill
 */
export interface Skill {
  path: string; // File system path
  name: string;
  description: string;
  frontmatter: SkillFrontmatter;
  content: string; // Markdown body
}

/**
 * Finding from an agent
 */
export const FindingSchema = z.object({
  agent: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string(),
  fix: z.string().optional(), // Proposed fix if available
});

export type Finding = z.infer<typeof FindingSchema>;

/**
 * Final inspection report
 */
export interface InspectionReport {
  skillName: string;
  overallScore: number; // 0-100
  findings: Finding[];
  summary: string;
  timestamp: string;
}

/**
 * LangGraph State Definition (Deprecated: Use InspectorAnnotation from workflows/state.ts)
 */
export type { InspectorState } from "../workflows/state.js";
