import { Skill, Finding } from "./types.js";
import { z } from "zod";
import path from "node:path";

const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .max(64)
    .regex(
      /^[a-z0-9-]+$/,
      "Name must be lowercase letters, numbers, and hyphens only",
    )
    .refine(
      (s) => !s.startsWith("-") && !s.endsWith("-"),
      "Name must not start or end with a hyphen",
    )
    .refine(
      (s) => !s.includes("--"),
      "Name must not contain consecutive hyphens",
    ),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  "allowed-tools": z.array(z.string()).optional(),
});

/**
 * Deterministically validate a skill against the specification
 */
export function validateSpec(skill: Skill): Finding[] {
  const findings: Finding[] = [];

  // 1. Validate Frontmatter
  const result = SkillFrontmatterSchema.safeParse(skill.frontmatter);
  if (!result.success) {
    for (const issue of result.error.issues) {
      findings.push({
        severity: "critical",
        message: `Frontmatter error in '${issue.path.join(".")}': ${issue.message}`,
        agent: "SpecValidator",
      });
    }
  }

  // 2. Validate Name matches directory name (if possible to check)
  const dirName = path.basename(path.dirname(skill.path));
  if (
    skill.name !== dirName &&
    dirName !== "." &&
    skill.path.endsWith("SKILL.md")
  ) {
    findings.push({
      severity: "critical",
      message: `Skill name '${skill.name}' does not match directory name '${dirName}'`,
      agent: "SpecValidator",
    });
  }

  // 3. Directory Structure Check
  // Note: Since this validator runs on a parsed Skill object,
  // it might not have full directory context unless we pass it.
  // For now, we focus on the content and frontmatter.

  // 4. Check for unauthorized fields in frontmatter
  const allowedFields = Object.keys(SkillFrontmatterSchema.shape);
  for (const key of Object.keys(skill.frontmatter)) {
    if (!allowedFields.includes(key)) {
      findings.push({
        severity: "medium",
        message: `Unauthorized frontmatter field: '${key}'`,
        agent: "SpecValidator",
      });
    }
  }

  return findings;
}
