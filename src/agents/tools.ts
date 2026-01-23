import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import matter from "gray-matter";

/**
 * Tool to read and parse a SKILL.md file
 */
export const skillReader = createTool({
  id: "skillReader",
  description: "Read and parse a SKILL.md file from a given path.",
  inputSchema: z.object({
    filePath: z.string().describe("The absolute path to the SKILL.md file"),
  }),
  execute: async (input) => {
    try {
      const content = await fs.readFile(input.filePath, "utf-8");
      const { data, content: markdownBody } = matter(content);
      return {
        frontmatter: data,
        body: markdownBody,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error reading skill file: ${errorMessage}`);
    }
  },
});

/**
 * Tool to explore files in the skill directory
 */
export const fileExplorer = createTool({
  id: "fileExplorer",
  description:
    "List files and directories in a given path to understand the skill's structure.",
  inputSchema: z.object({
    directoryPath: z.string().describe("The directory path to explore"),
  }),
  execute: async (input) => {
    try {
      const entries = await fs.readdir(input.directoryPath, {
        withFileTypes: true,
      });
      const files = entries.map(
        (e) => `${e.isDirectory() ? "[DIR] " : "[FILE] "}${e.name}`,
      );
      return { files };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Error exploring directory: ${errorMessage}`);
    }
  },
});

/**
 * Tool to provide specification details for agentskills.io
 */
export const specLookup = createTool({
  id: "specLookup",
  description:
    "Get details about the Agent Skills specification (agentskills.io).",
  inputSchema: z.object({
    query: z.string().describe("What you want to know about the spec"),
  }),
  execute: async () => {
    return {
      specDocs: `
      Agent Skills Specification (agentskills.io):
      - Required frontmatter: name (lowercase, hyphens, 1-64 chars), description (1-1024 chars).
      - Optional: license, compatibility, allowed-tools, metadata.
      - Structure: SKILL.md in a folder named after the skill.
      - Body: Markdown instructions for the agent.
      - Scripts: Optional 'scripts/' directory for automation.
    `,
    };
  },
});
