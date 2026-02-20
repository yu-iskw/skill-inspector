import { describe, it, expect } from "vitest";
import { mapCompliance, getAffectedFrameworks } from "./complianceMapper.js";
import { Finding } from "./types.js";

const makeFinding = (
  message: string,
  agent = "PatternScanner",
  severity: Finding["severity"] = "high",
): Finding => ({ severity, message, agent });

describe("mapCompliance", () => {
  it("returns findings unchanged when no rule matches", () => {
    const findings = [makeFinding("Some generic low-risk observation")];
    const result = mapCompliance(findings);
    expect(result[0].compliance).toBeUndefined();
  });

  it("maps AWS key finding to LLM02 (Sensitive Information Disclosure)", () => {
    const findings = [makeFinding("Hardcoded AWS Access Key ID detected")];
    const result = mapCompliance(findings);
    const refs = result[0].compliance ?? [];
    expect(refs.some((r) => r.id === "LLM02")).toBe(true);
    expect(refs.find((r) => r.id === "LLM02")?.framework).toBe(
      "OWASP LLM Top 10",
    );
  });

  it("maps GitHub token finding to LLM02", () => {
    const findings = [
      makeFinding(
        "Hardcoded GitHub personal access token detected",
        "PatternScanner",
        "critical",
      ),
    ];
    const result = mapCompliance(findings);
    expect(result[0].compliance?.some((r) => r.id === "LLM02")).toBe(true);
  });

  it("maps curl-pipe-to-shell finding to LLM03 and AML.T0010", () => {
    const findings = [
      makeFinding(
        "Remote code execution via curl-pipe-to-shell pattern detected",
        "PatternScanner",
        "critical",
      ),
    ];
    const result = mapCompliance(findings);
    const refs = result[0].compliance ?? [];
    expect(refs.some((r) => r.id === "LLM03")).toBe(true);
    expect(refs.some((r) => r.id === "AML.T0010")).toBe(true);
  });

  it("maps base64 blob finding to LLM04 and AML.T0020", () => {
    const findings = [
      makeFinding(
        "Long base64-encoded blob detected — possible obfuscated payload",
      ),
    ];
    const result = mapCompliance(findings);
    const refs = result[0].compliance ?? [];
    expect(refs.some((r) => r.id === "LLM04")).toBe(true);
    expect(refs.some((r) => r.id === "AML.T0020")).toBe(true);
  });

  it("maps rm -rf finding to LLM06 (Excessive Agency) and AML.T0048", () => {
    const findings = [
      makeFinding(
        "Destructive recursive file deletion command (rm -rf) detected",
        "PatternScanner",
        "critical",
      ),
    ];
    const result = mapCompliance(findings);
    const refs = result[0].compliance ?? [];
    expect(refs.some((r) => r.id === "LLM06")).toBe(true);
    expect(refs.some((r) => r.id === "AML.T0048")).toBe(true);
  });

  it("maps zero-width character finding to LLM01 and AML.T0051", () => {
    const findings = [
      makeFinding(
        "Zero-width or invisible unicode characters detected — potential hidden instruction injection",
      ),
    ];
    const result = mapCompliance(findings);
    const refs = result[0].compliance ?? [];
    expect(refs.some((r) => r.id === "LLM01")).toBe(true);
    expect(refs.some((r) => r.id === "AML.T0051")).toBe(true);
  });

  it("maps SpecValidator findings to SPEC-001 regardless of message", () => {
    const findings = [
      makeFinding(
        "Frontmatter error in 'name': Name must be lowercase",
        "SpecValidator",
        "critical",
      ),
    ];
    const result = mapCompliance(findings);
    const refs = result[0].compliance ?? [];
    expect(refs.some((r) => r.id === "SPEC-001")).toBe(true);
    expect(refs.find((r) => r.id === "SPEC-001")?.framework).toBe(
      "Agent Skills Spec",
    );
  });

  it("does not assign SPEC-001 to non-SpecValidator agents", () => {
    const findings = [
      makeFinding("Some security issue", "SecurityAuditor", "high"),
    ];
    const result = mapCompliance(findings);
    expect(result[0].compliance?.some((r) => r.id === "SPEC-001")).toBeFalsy();
  });

  it("de-duplicates compliance refs when multiple rules match the same framework ID", () => {
    // A finding whose message matches multiple rules that both reference LLM06
    const findings = [
      makeFinding(
        "Destructive recursive file deletion command (rm -rf) detected — eval() also present",
      ),
    ];
    const result = mapCompliance(findings);
    const refs = result[0].compliance ?? [];
    const llm06Count = refs.filter((r) => r.id === "LLM06").length;
    expect(llm06Count).toBe(1);
  });

  it("preserves all other finding fields", () => {
    const finding: Finding = {
      severity: "critical",
      message: "Hardcoded AWS Access Key ID detected",
      fix: "Use IAM roles.",
      agent: "PatternScanner",
    };
    const result = mapCompliance([finding]);
    expect(result[0].severity).toBe("critical");
    expect(result[0].fix).toBe("Use IAM roles.");
    expect(result[0].agent).toBe("PatternScanner");
  });
});

describe("getAffectedFrameworks", () => {
  it("returns empty array when no findings have compliance refs", () => {
    const findings: Finding[] = [
      { severity: "low", message: "minor issue", agent: "X" },
    ];
    expect(getAffectedFrameworks(findings)).toEqual([]);
  });

  it("returns sorted, unique framework labels", () => {
    const findings = mapCompliance([
      makeFinding("Hardcoded AWS Access Key ID detected"),
      makeFinding(
        "Long base64-encoded blob detected — possible obfuscated payload",
      ),
    ]);
    const labels = getAffectedFrameworks(findings);
    expect(labels.length).toBeGreaterThan(0);
    // Must be sorted
    const sorted = [...labels].sort();
    expect(labels).toEqual(sorted);
    // No duplicates
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("includes framework, id, and name in each label", () => {
    const findings = mapCompliance([
      makeFinding("Hardcoded AWS Access Key ID detected"),
    ]);
    const labels = getAffectedFrameworks(findings);
    expect(labels.some((l) => l.includes("OWASP LLM Top 10"))).toBe(true);
    expect(labels.some((l) => l.includes("LLM02"))).toBe(true);
    expect(
      labels.some((l) => l.includes("Sensitive Information Disclosure")),
    ).toBe(true);
  });
});
