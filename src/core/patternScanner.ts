import { Finding } from "./types.js";

interface PatternRule {
  id: string;
  pattern: RegExp;
  severity: Finding["severity"];
  message: string;
  fix?: string;
}

/**
 * Catalog of deterministic security patterns.
 * Ordered from most specific (lowest false-positive rate) to more general.
 */
const PATTERN_RULES: PatternRule[] = [
  // ── Secrets ─────────────────────────────────────────────────────────────────
  {
    id: "aws-access-key",
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: "critical",
    message: "Hardcoded AWS Access Key ID detected",
    fix: "Remove the key and use environment variables or IAM roles instead.",
  },
  {
    id: "github-token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/,
    severity: "critical",
    message: "Hardcoded GitHub personal access token detected",
    fix: "Remove the token and inject it via a GITHUB_TOKEN environment variable.",
  },
  {
    id: "private-key-block",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: "critical",
    message: "Private key material embedded in skill",
    fix: "Never embed private keys; use environment variables or a secret manager.",
  },
  {
    id: "jwt-token",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    severity: "high",
    message: "Hardcoded JWT token detected",
    fix: "Remove the token; JWTs should be dynamically issued per session.",
  },
  {
    id: "generic-api-key",
    pattern:
      /(?:api[_-]?key|x-api-key|apikey)\s*[=:]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/i,
    severity: "high",
    message: "Potential hardcoded API key detected",
    fix: "Move secrets to environment variables and reference them with $VAR_NAME.",
  },
  {
    id: "generic-secret",
    pattern: /(?:secret|token|password|passwd)\s*[=:]\s*['"][^'"]{8,}['"]/i,
    severity: "high",
    message: "Potential hardcoded secret or password detected",
    fix: "Move credentials to environment variables or a secret manager.",
  },

  // ── Dangerous Shell Commands ─────────────────────────────────────────────────
  {
    id: "rm-rf",
    pattern: /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*/,
    severity: "critical",
    message: "Destructive recursive file deletion command (rm -rf) detected",
    fix: "Scope deletion to a known safe subdirectory; never delete home or root paths.",
  },
  {
    id: "curl-pipe-shell",
    pattern: /curl\b[^\n|]*\|\s*(?:ba)?sh\b/,
    severity: "critical",
    message: "Remote code execution via curl-pipe-to-shell pattern detected",
    fix: "Download scripts to a verified path, inspect them, then execute explicitly.",
  },
  {
    id: "wget-pipe-shell",
    pattern: /wget\b[^\n|]*\|\s*(?:ba)?sh\b/,
    severity: "critical",
    message: "Remote code execution via wget-pipe-to-shell pattern detected",
    fix: "Download scripts to a verified path, inspect them, then execute explicitly.",
  },
  {
    id: "eval-call",
    pattern: /\beval\s*\(/,
    severity: "high",
    message: "eval() call detected — common command injection entry point",
    fix: "Avoid eval(); use explicit function calls or safer language-level alternatives.",
  },
  {
    id: "exec-shell-string",
    pattern: /\bexec\s*\(\s*['"`][^'"`,)]{0,20}(?:bash|sh|cmd|powershell)/i,
    severity: "high",
    message: "Shell exec with hardcoded interpreter detected",
    fix: "Use parameterized subprocess calls instead of shell=True or exec() strings.",
  },

  // ── Data Exfiltration ────────────────────────────────────────────────────────
  {
    id: "curl-data-post",
    pattern: /curl\b[^\n]*(?:--data|-d)\s[^\n]*https?:\/\//,
    severity: "medium",
    message: "Possible data exfiltration via curl POST to external URL",
    fix: "Verify the target URL is an authorized, internal endpoint.",
  },

  // ── Obfuscation / Hidden Instructions ────────────────────────────────────────
  {
    id: "base64-long-blob",
    // Require 200+ contiguous base64 chars to avoid false positives on short encoded values
    pattern: /[A-Za-z0-9+/]{200,}={0,2}/,
    severity: "medium",
    message: "Long base64-encoded blob detected — possible obfuscated payload",
    fix: "Replace encoded content with readable plaintext or an external resource reference.",
  },
  {
    id: "unicode-zero-width",
    // Zero-width space, zero-width non-joiner, zero-width joiner, BOM, word joiner
    pattern: /[\u200B-\u200D\uFEFF\u2060]/,
    severity: "medium",
    message:
      "Zero-width or invisible unicode characters detected — potential hidden instruction injection",
    fix: "Strip all zero-width unicode characters from skill content.",
  },

  // ── Path Traversal ───────────────────────────────────────────────────────────
  {
    id: "path-traversal",
    pattern: /(?:\.\.\/\.\.\/|\.\.\\\.\.\\|\.\.%2[Ff])/,
    severity: "high",
    message: "Path traversal sequence (../../) detected",
    fix: "Sanitize path inputs and reject any sequence containing '..'.",
  },
];

/**
 * Synchronously scan text content line-by-line for known dangerous patterns.
 *
 * Each distinct rule fires at most once per line (deduplication by rule+line).
 * Returns findings tagged with agent: "PatternScanner".
 */
export function scanPatterns(
  content: string,
  filePath = "SKILL.md",
): Array<Finding> {
  const findings: Array<Finding> = [];
  const lines = content.split("\n");

  for (const rule of PATTERN_RULES) {
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        findings.push({
          severity: rule.severity,
          message: `${rule.message} (${filePath}:${i + 1})`,
          fix: rule.fix,
          agent: "PatternScanner",
        });
        // Only report the first match per rule to avoid flooding findings
        // for patterns that repeat (e.g., base64 scattered across a file).
        break;
      }
    }
  }

  return findings;
}
