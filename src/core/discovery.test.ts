import { describe, it, expect } from "vitest";
import { discoverSkills, normalizeRepoUrl } from "./discovery.js";
import path from "node:path";
import fs from "node:fs/promises";

describe("discovery", () => {
  it("should find skills in a directory", async () => {
    const testDir = path.resolve(process.cwd(), "test/safe-skill");
    const { skills } = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("safe-greet");
    expect(skills[0].frontmatter.name).toBe("safe-greet");
  });

  it("should find skills recursively if not in standard path", async () => {
    // Standard path would be SKILL.md in root of search, but we check recursive too
    const testDir = path.resolve(process.cwd(), "test");
    const { skills } = await discoverSkills(testDir);
    expect(skills.length).toBeGreaterThanOrEqual(2); // safe-skill and malicious-skill
  });

  it("should handle invalid frontmatter gracefully by throwing", async () => {
    // Create a temporary invalid skill file
    const tempDir = path.join(process.cwd(), ".temp-test-invalid");
    await fs.mkdir(tempDir, { recursive: true });
    const skillPath = path.join(tempDir, "SKILL.md");
    await fs.writeFile(skillPath, "---\nname: INVALID NAME\n---");

    // When pointing to the file directly, it should throw
    await expect(discoverSkills(skillPath)).rejects.toThrow(
      "Invalid frontmatter",
    );

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return empty array if no SKILL.md found", async () => {
    const tempDir = path.join(process.cwd(), ".temp-test-empty");
    await fs.mkdir(tempDir, { recursive: true });

    const { skills } = await discoverSkills(tempDir);
    expect(skills).toHaveLength(0);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("normalizeRepoUrl", () => {
    it("should default to github.com for unqualified paths", () => {
      expect(normalizeRepoUrl("owner/repo")).toBe(
        "https://github.com/owner/repo",
      );
    });

    it("should respect existing schemes", () => {
      expect(normalizeRepoUrl("http://gitlab.com/org/repo")).toBe(
        "http://gitlab.com/org/repo",
      );
      expect(normalizeRepoUrl("https://bitbucket.org/org/repo")).toBe(
        "https://bitbucket.org/org/repo",
      );
    });

    it("should detect allowed hosts without scheme", () => {
      expect(normalizeRepoUrl("gitlab.com/org/repo")).toBe(
        "https://gitlab.com/org/repo",
      );
      expect(normalizeRepoUrl("bitbucket.org/org/repo")).toBe(
        "https://bitbucket.org/org/repo",
      );
      expect(normalizeRepoUrl("github.com/org/repo")).toBe(
        "https://github.com/org/repo",
      );
    });

    it("should handle host-only paths", () => {
      expect(normalizeRepoUrl("gitlab.com")).toBe("https://gitlab.com");
    });

    it("should not misidentify hosts as prefixes", () => {
      // "gitlab.com.untrusted.io" should still default to github or be handled as is
      // but based on current implementation it will default to github.com/gitlab.com.untrusted.io
      expect(normalizeRepoUrl("gitlab.com.untrusted.io/org/repo")).toBe(
        "https://github.com/gitlab.com.untrusted.io/org/repo",
      );
    });
  });
});
