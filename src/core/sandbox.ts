/**
 * Secure in-memory sandbox for remote skill inspection.
 *
 * Uses isomorphic-git + memfs to clone the repository entirely in RAM.
 * Only the discovered SKILL.md files are written to os.tmpdir() so that
 * the LLM agent file-tools have a real path to read — but NO other repo
 * content (scripts, binaries, symlinks, hidden files) ever touches the host
 * filesystem.
 *
 * Platform: pure Node.js, no native deps, works on Linux / macOS / Windows.
 */
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { Volume, createFsFromVolume } from "memfs";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { Skill } from "./types.js";
import { logger } from "./logger.js";

/** Root path used inside the memfs volume for every clone. */
const MEM_CLONE_ROOT = "/repo";

/**
 * Recursively find all SKILL.md files inside a memfs Volume.
 * Uses posix-style paths internally (memfs always uses `/`).
 */
function findSkillsInVolume(vol: InstanceType<typeof Volume>, dir: string): string[] {
  const results: string[] = [];

  let rawEntries: (string | Buffer)[];
  try {
    rawEntries = vol.readdirSync(dir) as (string | Buffer)[];
  } catch {
    return results;
  }

  for (const raw of rawEntries) {
    const entry = raw.toString();
    // memfs always uses forward slashes
    const fullPath = `${dir}/${entry}`;

    let isDir = false;
    let isFile = false;
    try {
      const stat = vol.statSync(fullPath);
      isDir = stat.isDirectory();
      isFile = stat.isFile();
    } catch {
      continue;
    }

    if (isDir && !entry.startsWith(".") && entry !== "node_modules") {
      results.push(...findSkillsInVolume(vol, fullPath));
    } else if (isFile && entry === "SKILL.md") {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Clone `repoUrl` into an in-memory Volume, find every SKILL.md, then write
 * only those files to a fresh subdirectory inside `os.tmpdir()`.
 *
 * Returns:
 *   - `skills`     — parsed Skill objects whose `.path` points into `sandboxDir`
 *   - `sandboxDir` — the temporary directory to pass back to the caller for cleanup
 */
export async function discoverSkillsInSandbox(repoUrl: string): Promise<{
  skills: Array<Skill>;
  sandboxDir: string;
}> {
  // ── 1. Clone into memory ────────────────────────────────────────────────────
  const vol = new Volume();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memFsClient = createFsFromVolume(vol) as any;

  logger.debug(`[sandbox] Cloning ${repoUrl} into memory...`);

  try {
    await git.clone({
      fs: memFsClient,
      http,
      dir: MEM_CLONE_ROOT,
      url: repoUrl,
      depth: 1,
      singleBranch: true,
      noTags: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[sandbox] Failed to clone ${repoUrl}: ${msg}`);
  }

  logger.debug("[sandbox] Clone complete. Scanning for SKILL.md files...");

  // ── 2. Find SKILL.md files in memory ───────────────────────────────────────
  const memPaths = findSkillsInVolume(vol, MEM_CLONE_ROOT);
  logger.debug(`[sandbox] Found ${memPaths.length} SKILL.md file(s) in memory.`);

  // ── 3. Write only SKILL.md content to os.tmpdir() ──────────────────────────
  const sandboxDir = path.join(os.tmpdir(), `.skill-sandbox-${Date.now()}`);
  await fs.mkdir(sandboxDir, { recursive: true });

  const skills: Array<Skill> = [];

  for (const memPath of memPaths) {
    let content: string;
    try {
      content = vol.readFileSync(memPath, { encoding: "utf8" }) as string;
    } catch (err) {
      logger.warn(`[sandbox] Could not read ${memPath}`, { err });
      continue;
    }

    let frontmatter: Record<string, unknown>;
    let markdownBody: string;
    try {
      const parsed = matter(content);
      frontmatter = parsed.data;
      markdownBody = parsed.content;
    } catch (err) {
      logger.warn(`[sandbox] Failed to parse frontmatter in ${memPath}`, { err });
      continue;
    }

    if (!frontmatter.name || !frontmatter.description) {
      logger.warn(`[sandbox] Skipping ${memPath}: missing required frontmatter (name, description)`);
      continue;
    }

    // Convert posix memfs path → real filesystem path safely (cross-platform)
    // Strip the leading MEM_CLONE_ROOT prefix, split on '/', join with path.join
    const relPosix = memPath.slice(MEM_CLONE_ROOT.length + 1); // e.g. "skills/my-skill/SKILL.md"
    const relParts = relPosix.split("/");
    const destPath = path.join(sandboxDir, ...relParts);

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, content, "utf-8");

    skills.push({
      path: destPath,
      name: frontmatter.name as string,
      description: frontmatter.description as string,
      frontmatter,
      content: markdownBody,
    });
  }

  return { skills, sandboxDir };
}
