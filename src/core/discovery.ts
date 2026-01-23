import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { simpleGit } from "simple-git";
import { Skill } from "./types.js";

const STANDARD_SKILL_PATHS = [
  "SKILL.md",
  "skills/SKILL.md",
  "skills/.curated/SKILL.md",
  "skills/.experimental/SKILL.md",
  "skills/.system/SKILL.md",
  ".agents/skills/SKILL.md",
  ".agent/skills/SKILL.md",
  ".claude/skills/SKILL.md",
  ".cline/skills/SKILL.md",
  ".codex/skills/SKILL.md",
  ".cursor/skills/SKILL.md",
  ".gemini/skills/SKILL.md",
  ".github/skills/SKILL.md",
  ".goose/skills/SKILL.md",
];

/**
 * Robustly find and parse a skill from a local or remote path
 */
export async function discoverSkills(inputPath: string): Promise<Skill[]> {
  let searchDir = inputPath;
  let tempDir = "";

  try {
    // Check if it's a local path first
    const localExists = await fs
      .stat(inputPath)
      .then(() => true)
      .catch(() => false);

    // Handle Remote Repos (Git) if not a local path
    if (
      !localExists &&
      (inputPath.startsWith("http") ||
        inputPath.endsWith(".git") ||
        inputPath.includes("/"))
    ) {
      const repoUrl = inputPath.includes("://")
        ? inputPath
        : `https://github.com/${inputPath}`;
      tempDir = path.join(process.cwd(), `.temp-inspect-${Date.now()}`);
      await simpleGit().clone(repoUrl, tempDir, ["--depth", "1"]);
      searchDir = tempDir;
    }

    const skills: Skill[] = [];
    const stats = await fs.stat(searchDir);

    if (stats.isFile() && searchDir.endsWith("SKILL.md")) {
      const skill = await parseSkillFile(searchDir);
      if (skill) skills.push(skill);
    } else if (stats.isDirectory()) {
      // 1. Check standard paths
      for (const relPath of STANDARD_SKILL_PATHS) {
        const fullPath = path.join(searchDir, relPath);
        try {
          const skill = await parseSkillFile(fullPath);
          if (skill) skills.push(skill);
        } catch {
          // Skip if not found
        }
      }

      // 2. If nothing found in standard paths, do a recursive search
      if (skills.length === 0) {
        const foundFiles = await findSkillFilesRecursive(searchDir);
        for (const f of foundFiles) {
          const skill = await parseSkillFile(f);
          if (skill) skills.push(skill);
        }
      }
    }

    return skills;
  } catch (error) {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

async function parseSkillFile(filePath: string): Promise<Skill | null> {
  const content = await fs.readFile(filePath, "utf-8");
  const { data, content: markdownBody } = matter(content);

  // Basic validation of frontmatter
  if (!data.name || !data.description) {
    throw new Error(
      `Invalid frontmatter in ${filePath}: name and description are required`,
    );
  }

  return {
    path: filePath,
    name: data.name,
    description: data.description,
    frontmatter: data,
    content: markdownBody,
  };
}

async function findSkillFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "node_modules"
    ) {
      results.push(...(await findSkillFilesRecursive(fullPath)));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }

  return results;
}
