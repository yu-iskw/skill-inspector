import { describe, it, expect } from "vitest";
import { validateSpec } from "./validators.js";
import { Skill } from "./types.js";

describe("validateSpec", () => {
  const baseSkill: Skill = {
    path: "path/to/my-skill/SKILL.md",
    name: "my-skill",
    description: "A test skill",
    frontmatter: {
      name: "my-skill",
      description: "A test skill",
    },
    content: "Body text",
  };

  it("should return no findings for a valid skill", () => {
    const findings = validateSpec(baseSkill);
    expect(findings).toHaveLength(0);
  });

  it("should return critical finding for directory name mismatch", () => {
    const skill: Skill = {
      ...baseSkill,
      name: "wrong-name",
      frontmatter: {
        ...baseSkill.frontmatter,
        name: "wrong-name",
      },
    };
    const findings = validateSpec(skill);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].message).toContain("does not match directory name");
  });

  it("should return critical findings for invalid frontmatter", () => {
    const skill: Skill = {
      ...baseSkill,
      frontmatter: {
        ...baseSkill.frontmatter,
        name: "Invalid Name With Spaces",
      },
    };
    const findings = validateSpec(skill);
    expect(findings.some((f) => f.severity === "critical")).toBe(true);
  });

  it("should return medium findings for unauthorized frontmatter fields", () => {
    const skill: Skill = {
      ...baseSkill,
      frontmatter: {
        ...baseSkill.frontmatter,
        extra_field: "something",
      },
    };
    const findings = validateSpec(skill);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].message).toContain("Unauthorized frontmatter field");
  });

  it("should not complain if path does not end with SKILL.md (recursive discovery edge case)", () => {
    const skill: Skill = {
      ...baseSkill,
      path: "some/other/file.md",
      name: "not-matching-dir",
    };
    const findings = validateSpec(skill);
    // Should not have the directory mismatch finding because path doesn't end with SKILL.md
    expect(
      findings.filter((f) =>
        f.message.includes("does not match directory name"),
      ),
    ).toHaveLength(0);
  });

  it("should not complain if directory name is '.'", () => {
    const skill: Skill = {
      ...baseSkill,
      path: "SKILL.md",
      name: "some-name",
    };
    const findings = validateSpec(skill);
    expect(
      findings.filter((f) =>
        f.message.includes("does not match directory name"),
      ),
    ).toHaveLength(0);
  });
});
