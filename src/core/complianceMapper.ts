import { ComplianceRef, Finding } from "./types.js";

const OWASP_BASE = "https://genai.owasp.org/llm-top-10/";
const ATLAS_BASE = "https://atlas.mitre.org/techniques/";

interface MappingRule {
  /**
   * If set, the finding's agent name must match this pattern for the rule to fire.
   * When omitted, the rule fires for any agent.
   */
  requireAgent?: RegExp;
  /**
   * If set, at least one pattern must match the finding's message for the rule to fire.
   * When omitted, the rule fires regardless of message content.
   */
  messagePatterns?: RegExp[];
  refs: ComplianceRef[];
}

/**
 * Mapping rules from finding characteristics to compliance framework references.
 *
 * Logic per rule:
 *   - requireAgent set   → agent name MUST match
 *   - messagePatterns set → at least one MUST match the finding message
 *   - Both conditions must hold when both are present.
 */
const MAPPING_RULES: MappingRule[] = [
  // ── LLM01: Prompt Injection ──────────────────────────────────────────────────
  // Hidden instructions via unicode tricks are the static-detectable form.
  {
    messagePatterns: [/zero-width|invisible unicode|hidden instruction/i],
    refs: [
      {
        framework: "OWASP LLM Top 10",
        id: "LLM01",
        name: "Prompt Injection",
        url: `${OWASP_BASE}llm01-prompt-injection/`,
      },
      {
        framework: "MITRE ATLAS",
        id: "AML.T0051",
        name: "LLM Prompt Injection",
        url: `${ATLAS_BASE}AML.T0051/`,
      },
    ],
  },

  // ── LLM02: Sensitive Information Disclosure ───────────────────────────────────
  {
    messagePatterns: [
      /aws access key|github.*token|private key|jwt token|api key|hardcoded.*secret|hardcoded.*password|potential hardcoded/i,
    ],
    refs: [
      {
        framework: "OWASP LLM Top 10",
        id: "LLM02",
        name: "Sensitive Information Disclosure",
        url: `${OWASP_BASE}llm02-sensitive-information-disclosure/`,
      },
    ],
  },

  // ── LLM03: Supply Chain ───────────────────────────────────────────────────────
  // Remote code execution via curl/wget piped to shell.
  {
    messagePatterns: [/curl-pipe-to-shell|wget-pipe-to-shell|remote code execution/i],
    refs: [
      {
        framework: "OWASP LLM Top 10",
        id: "LLM03",
        name: "Supply Chain",
        url: `${OWASP_BASE}llm03-supply-chain/`,
      },
      {
        framework: "MITRE ATLAS",
        id: "AML.T0010",
        name: "ML Supply Chain Compromise",
        url: `${ATLAS_BASE}AML.T0010/`,
      },
    ],
  },

  // ── LLM04: Data and Model Poisoning ──────────────────────────────────────────
  // Obfuscated payloads that could embed malicious instructions.
  {
    messagePatterns: [/base64.*blob|obfuscat|encoded blob/i],
    refs: [
      {
        framework: "OWASP LLM Top 10",
        id: "LLM04",
        name: "Data and Model Poisoning",
        url: `${OWASP_BASE}llm04-data-model-poisoning/`,
      },
      {
        framework: "MITRE ATLAS",
        id: "AML.T0020",
        name: "Poison Training Data",
        url: `${ATLAS_BASE}AML.T0020/`,
      },
    ],
  },

  // ── LLM06: Excessive Agency ───────────────────────────────────────────────────
  // Destructive actions, command injection, path traversal.
  {
    messagePatterns: [
      /rm -rf|destructive.*file deletion|eval\(\)|command injection|exec.*shell|path traversal|data exfiltrat/i,
    ],
    refs: [
      {
        framework: "OWASP LLM Top 10",
        id: "LLM06",
        name: "Excessive Agency",
        url: `${OWASP_BASE}llm06-excessive-agency/`,
      },
      {
        framework: "MITRE ATLAS",
        id: "AML.T0048",
        name: "Backdoor ML Model",
        url: `${ATLAS_BASE}AML.T0048/`,
      },
    ],
  },

  // ── agentskills.io Spec Compliance ───────────────────────────────────────────
  // All SpecValidator findings map to the internal specification standard.
  {
    requireAgent: /specvalidator/i,
    refs: [
      {
        framework: "Agent Skills Spec",
        id: "SPEC-001",
        name: "agentskills.io Compliance",
        url: "https://agentskills.io",
      },
    ],
  },
];

/**
 * Enrich a list of findings with compliance framework references.
 *
 * Each finding is matched against MAPPING_RULES; all matching refs are
 * de-duplicated by ID and attached as `finding.compliance`.
 */
export function mapCompliance(findings: Array<Finding>): Array<Finding> {
  return findings.map((finding) => {
    const refs: ComplianceRef[] = [];

    for (const rule of MAPPING_RULES) {
      const agentOk =
        !rule.requireAgent || rule.requireAgent.test(finding.agent ?? "");
      const messageOk =
        !rule.messagePatterns ||
        rule.messagePatterns.some((p) => p.test(finding.message));

      if (agentOk && messageOk) {
        for (const ref of rule.refs) {
          if (!refs.some((r) => r.id === ref.id)) {
            refs.push(ref);
          }
        }
      }
    }

    return refs.length > 0 ? { ...finding, compliance: refs } : finding;
  });
}

/**
 * Collect the unique set of compliance labels touched by the given findings,
 * formatted as "<framework>: <id> — <name>".
 *
 * Useful for summary reporting and the --compliance CLI flag.
 */
export function getAffectedFrameworks(findings: Array<Finding>): Array<string> {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const f of findings) {
    for (const ref of f.compliance ?? []) {
      const label = `${ref.framework}: ${ref.id} — ${ref.name}`;
      if (!seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }
  }

  return result.sort();
}
