import { describe, it, expect } from "vitest";
import { skillReader, fileExplorer, specLookup } from "./tools.js";
import path from "node:path";
import fs from "node:fs/promises";

describe("custom tools", () => {
  describe("skillReader", () => {
    it("should read and parse a valid SKILL.md", async () => {
      const filePath = path.resolve(process.cwd(), "test/safe-skill/SKILL.md");
      const result = await skillReader.invoke({ filePath });
      const parsed = JSON.parse(result);
      expect(parsed.frontmatter.name).toBe("safe-greet");
      expect(parsed.body).toContain("Safe Greet");
    });

    it("should return an error for non-existent file", async () => {
      const result = await skillReader.invoke({ filePath: "non-existent.md" });
      expect(result).toContain("Error reading skill file");
    });
  });

  describe("fileExplorer", () => {
    it("should list files in a directory", async () => {
      const directoryPath = path.resolve(process.cwd(), "test/safe-skill");
      const result = await fileExplorer.invoke({ directoryPath });
      expect(result).toContain("[FILE] SKILL.md");
    });

    it("should return an error for non-existent directory", async () => {
      const result = await fileExplorer.invoke({
        directoryPath: "non-existent-dir",
      });
      expect(result).toContain("Error exploring directory");
    });
  });

  describe("specLookup", () => {
    it("should return specification details", async () => {
      const result = await specLookup.invoke({ query: "frontmatter" });
      expect(result).toContain("Agent Skills Specification");
      expect(result).toContain("Required frontmatter");
    });
  });
});
