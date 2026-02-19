import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { simpleGit } from "simple-git";
import { Skill } from "./types.js";
import { logger } from "./logger.js";
import { z } from "zod";
import { discoverSkillsInSandbox } from "./sandbox.js";

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

const ALLOWED_REMOTE_HOSTS = ["github.com", "gitlab.com", "bitbucket.org"];

/**
 * Normalizes a repository path into a full URL.
 * If no scheme is present, it defaults to github.com unless an allowed host is detected.
 */
export function normalizeRepoUrl(inputPath: string): string {
  if (inputPath.includes("://")) {
    return inputPath;
  }

  const hasAllowedHost = ALLOWED_REMOTE_HOSTS.some(
    (host) => inputPath === host || inputPath.startsWith(`${host}/`),
  );

  return hasAllowedHost
    ? `https://${inputPath}`
    : `https://github.com/${inputPath}`;
}

const RemotePathSchema = z
  .string()
  .url()
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ALLOWED_REMOTE_HOSTS.includes(parsed.hostname);
      } catch {
        return false;
      }
    },
    {
      message: `Remote URL must be from one of the allowed hosts: ${ALLOWED_REMOTE_HOSTS.join(", ")}`,
    },
  );

export interface DiscoverOptions {
  /**
   * When true, remote repositories are cloned entirely in memory using
   * isomorphic-git + memfs.  Only the discovered SKILL.md files are written
   * to os.tmpdir(), so arbitrary repo content never touches the host
   * filesystem.  No extra system tooling is required — pure Node.js.
   */
  sandbox?: boolean;
}

/**
 * Robustly find and parse a skill from a local or remote path
 */
export async function discoverSkills(
  inputPath: string,
  options: DiscoverOptions = {},
): Promise<{ skills: Array<Skill>; tempDir?: string }> {
  let searchDir = inputPath;
  let tempDir = "";

  try {
    // Check if it's a local path first
    const absoluteInputPath = path.resolve(inputPath);
    const localExists = await fs
      .stat(absoluteInputPath)
      .then(() => true)
      .catch(() => false);

    if (localExists) {
      searchDir = absoluteInputPath;
    }

    // Handle Remote Repos (Git) if not a local path
    if (!localExists) {
      const isPotentialRemote =
        inputPath.startsWith("http") ||
        inputPath.endsWith(".git") ||
        (inputPath.includes("/") && !inputPath.startsWith("."));

      if (isPotentialRemote) {
        const repoUrl = normalizeRepoUrl(inputPath);

        // Validate remote URL
        const validation = RemotePathSchema.safeParse(repoUrl);
        if (!validation.success) {
          throw new Error(
            `Invalid or disallowed remote path: ${inputPath}. ${validation.error.issues[0].message}`,
          );
        }

        if (options.sandbox) {
          // ── Secure sandbox mode ──────────────────────────────────────────
          // Clone into memory (isomorphic-git + memfs); only SKILL.md files
          // are written to os.tmpdir() — no other repo content touches disk.
          logger.info(`[sandbox] Fetching skills in-memory from: ${repoUrl}`);
          const { skills, sandboxDir } = await discoverSkillsInSandbox(repoUrl);
          return { skills, tempDir: sandboxDir };
        } else {
          // ── Legacy mode: shallow clone to CWD ───────────────────────────
          tempDir = path.join(process.cwd(), `.temp-inspect-${Date.now()}`);
          logger.debug(`Cloning remote repository: ${repoUrl} to ${tempDir}`);
          await simpleGit().clone(repoUrl, tempDir, ["--depth", "1"]);
          searchDir = tempDir;
        }
      }
    }

    const skills: Array<Skill> = [];
    const stats = await fs.stat(searchDir);

    if (stats.isFile() && searchDir.endsWith("SKILL.md")) {
      const skill = await parseSkillFile(searchDir);
      if (skill) skills.push(skill);
    } else if (stats.isDirectory()) {
      // 1. Check standard paths
      const potentialPaths = new Set(STANDARD_SKILL_PATHS);

      // Add skills/*/SKILL.md and others that follow the folder-per-skill pattern
      try {
        const standardContainers = [
          "",
          "skills",
          ".agents/skills",
          ".agent/skills",
          ".claude/skills",
          ".cline/skills",
          ".codex/skills",
          ".cursor/skills",
        ];
        for (const container of standardContainers) {
          const containerPath = container
            ? path.join(searchDir, container)
            : searchDir;
          const containerExists = await fs
            .stat(containerPath)
            .then((s) => s.isDirectory())
            .catch(() => false);

          if (containerExists) {
            const subdirs = await fs.readdir(containerPath, {
              withFileTypes: true,
            });
            for (const subdir of subdirs) {
              if (subdir.isDirectory() && !subdir.name.startsWith(".")) {
                potentialPaths.add(
                  path.join(container, subdir.name, "SKILL.md"),
                );
              }
            }
          }
        }
      } catch (error) {
        logger.debug("Error during standard path expansion", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      for (const relPath of potentialPaths) {
        const fullPath = path.join(searchDir, relPath);
        try {
          const exists = await fs
            .stat(fullPath)
            .then(() => true)
            .catch(() => false);
          if (exists) {
            const skill = await parseSkillFile(fullPath);
            if (skill) skills.push(skill);
          }
        } catch (error) {
          logger.warn(`Failed to parse skill at ${fullPath}`, { error });
        }
      }

      // 2. If nothing found in standard paths, do a recursive search
      if (skills.length === 0) {
        logger.debug(
          `No skills found in standard paths, searching recursively in ${searchDir}`,
        );
        const foundFiles = await findSkillFilesRecursive(searchDir);
        for (const f of foundFiles) {
          try {
            const skill = await parseSkillFile(f);
            if (skill) skills.push(skill);
          } catch (error) {
            logger.warn(`Failed to parse skill at ${f}`, { error });
          }
        }
      }
    }

    return { skills, tempDir };
  } catch (error) {
    if (tempDir) {
      logger.debug(`Cleaning up temporary directory on error: ${tempDir}`);
      await fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
        logger.error(`Failed to cleanup temp directory ${tempDir}`, err);
      });
    }
    logger.error("Error during skill discovery", error);
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

async function findSkillFilesRecursive(dir: string): Promise<Array<string>> {
  const results: Array<string> = [];
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
