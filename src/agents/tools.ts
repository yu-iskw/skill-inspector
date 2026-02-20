import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

/**
 * Ensures the path is within the allowed root directory
 */
async function validatePath(allowedRoot: string, targetPath: string) {
  const absoluteRoot = await fs.realpath(path.resolve(allowedRoot));
  let absoluteTarget;
  try {
    absoluteTarget = await fs.realpath(path.resolve(targetPath));
  } catch {
    // If the file doesn't exist, we still want to check the path lexically
    // so that we can't even "probe" paths outside the root.
    // However, for non-existent files, we can't resolve symlinks.
    // In this context, these tools are for reading existing files,
    // so if it doesn't exist, it will fail later anyway.
    absoluteTarget = path.resolve(targetPath);
  }

  const relative = path.relative(absoluteRoot, absoluteTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Access denied: Path ${targetPath} is outside the allowed directory ${allowedRoot}`,
    );
  }
}

/**
 * Tool to read and parse a SKILL.md file
 */
export const createSkillReader = (allowedRoot: string) =>
  createTool({
    id: "skillReader",
    description: "Read and parse a SKILL.md file from a given path.",
    inputSchema: z.object({
      filePath: z.string().describe("The absolute path to the SKILL.md file"),
    }),
    execute: async (input) => {
      try {
        await validatePath(allowedRoot, input.filePath);
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
export const createFileExplorer = (allowedRoot: string) =>
  createTool({
    id: "fileExplorer",
    description:
      "List files and directories in a given path to understand the skill's structure.",
    inputSchema: z.object({
      directoryPath: z.string().describe("The directory path to explore"),
    }),
    execute: async (input) => {
      try {
        await validatePath(allowedRoot, input.directoryPath);
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

const MAX_FILE_READ_BYTES = 50 * 1024; // 50 KB cap

/**
 * Tool to read the raw content of any file in the skill directory.
 * Used by security agents to inspect scripts, assets, and other files.
 */
export const createFileReader = (allowedRoot: string) =>
  createTool({
    id: "fileReader",
    description:
      "Read the raw content of any file in the skill directory (scripts, assets, etc.). Use this to inspect file contents for malicious code, hardcoded secrets, or obfuscation. Capped at 50 KB.",
    inputSchema: z.object({
      filePath: z.string().describe("The absolute path to the file to read"),
    }),
    execute: async (input) => {
      try {
        await validatePath(allowedRoot, input.filePath);
        const content = await fs.readFile(input.filePath, "utf-8");
        const truncated = content.length > MAX_FILE_READ_BYTES;
        return {
          content: truncated
            ? `${content.slice(0, MAX_FILE_READ_BYTES)}\n[...truncated at 50 KB]`
            : content,
          truncated,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(`Error reading file: ${errorMessage}`);
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
