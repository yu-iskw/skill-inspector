import { describe, it, expect } from "vitest";
import { createSkillReader, createFileExplorer, specLookup } from "./tools.js";
import path from "node:path";

describe("custom tools", () => {
  const allowedRoot = process.cwd();
  const skillReader = createSkillReader(allowedRoot);
  const fileExplorer = createFileExplorer(allowedRoot);

  describe("skillReader", () => {
    it("should read and parse a valid SKILL.md", async () => {
      const filePath = path.resolve(process.cwd(), "test/safe-skill/SKILL.md");
      const result = (await (skillReader as any).execute({ filePath }, {})) as {
        frontmatter: any;
        body: string;
      };

      expect(result.frontmatter.name).toBe("safe-greet");
      expect(result.body).toContain("Safe Greet");
    });

    it("should return an error for non-existent file", async () => {
      await expect(
        (skillReader as any).execute(
          {
            filePath: "non-existent.md",
          },
          {},
        ),
      ).rejects.toThrow();
    });

    it("should reject access to files outside allowed root", async () => {
      const restrictedReader = createSkillReader(
        path.join(allowedRoot, "test"),
      );
      await expect(
        (restrictedReader as any).execute(
          {
            filePath: path.join(allowedRoot, "package.json"),
          },
          {},
        ),
      ).rejects.toThrow(/Access denied/);
    });
  });

  describe("fileExplorer", () => {
    it("should list files in a directory", async () => {
      const directoryPath = path.resolve(process.cwd(), "test/safe-skill");
      const result = (await (fileExplorer as any).execute(
        { directoryPath },
        {},
      )) as { files: Array<string> };

      expect(result.files).toContain("[FILE] SKILL.md");
    });

    it("should return an error for non-existent directory", async () => {
      await expect(
        (fileExplorer as any).execute(
          {
            directoryPath: "non-existent-dir",
          },
          {},
        ),
      ).rejects.toThrow();
    });
  });

  describe("specLookup", () => {
    it("should return specification details", async () => {
      const result = (await (specLookup as any).execute(
        {
          query: "frontmatter",
        },
        {},
      )) as { specDocs: string };

      expect(result.specDocs).toContain("Agent Skills Specification");
      expect(result.specDocs).toContain("Required frontmatter");
    });
  });
});
