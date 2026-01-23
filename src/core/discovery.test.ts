import { describe, it, expect } from "vitest";
import { discoverSkills } from "./discovery.js";
import path from "node:path";
import fs from "node:fs/promises";

describe("discovery", () => {
  it("should find skills in a directory", async () => {
    const testDir = path.resolve(process.cwd(), "test/safe-skill");
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("safe-greet");
    expect(skills[0].frontmatter.name).toBe("safe-greet");
  });

  it("should find skills recursively if not in standard path", async () => {
    // Standard path would be SKILL.md in root of search, but we check recursive too
    const testDir = path.resolve(process.cwd(), "test");
    const skills = await discoverSkills(testDir);
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

    const skills = await discoverSkills(tempDir);
    expect(skills).toHaveLength(0);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
