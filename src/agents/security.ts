import { InspectorState, Finding } from "../core/types.js";
import { getChatModel } from "../core/llm.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import chalk from "chalk";

/**
 * Audits the skill for security vulnerabilities
 */
export async function securityAuditorNode(
  state: InspectorState,
): Promise<Partial<InspectorState>> {
  if (!state.skill) return { errors: [...state.errors, "No skill to audit"] };

  if (state.debug)
    console.log(
      chalk.gray("[SecurityAuditor] Scanning for malicious patterns..."),
    );

  const llm = state.model || getChatModel();
  const skill = state.skill;

  const prompt = `
Analyze the following Agent Skill for SECURITY risks.

SKILL DATA:
Name: ${skill.name}
Content:
---
${skill.content}
---

LOOK FOR:
1. Unauthorized file system access (e.g., deleting files, reading sensitive directories like ~/.ssh).
2. Network exfiltration (sending data to unknown external URLs).
3. Arbitrary command execution (shell scripts with high risk).
4. Prompt injection or "jailbreak" potential within the skill instructions.
5. Suspicious use of tools or scripts.

Return your findings as a JSON array of objects:
[
  { "severity": "low" | "medium" | "high" | "critical", "message": "string", "fix": "optional suggested fix" }
]
Only return the JSON.
`;

  try {
    const response = await llm.invoke([
      new SystemMessage(
        "You are a security expert auditing AI Agent Skills for malicious behaviors.",
      ),
      new HumanMessage(prompt),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    const jsonStr = content.match(/\[[\s\S]*\]/)?.[0] || content;
    const rawFindings = JSON.parse(jsonStr) as Array<{
      severity: Finding["severity"];
      message: string;
      fix?: string;
    }>;

    const findings: Finding[] = rawFindings.map((f) => ({
      ...f,
      agent: "SecurityAuditor",
    }));

    // Calculate a rough score based on severity
    let penalty = 0;
    for (const f of findings) {
      if (f.severity === "critical") penalty += 50;
      else if (f.severity === "high") penalty += 25;
      else if (f.severity === "medium") penalty += 10;
      else if (f.severity === "low") penalty += 2;
    }

    const newScore = Math.max(0, 100 - penalty);

    return {
      findings: [...state.findings, ...findings],
      score: Math.min(state.score, newScore), // Keep the lowest score
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      errors: [...state.errors, `SecurityAuditor failed: ${errorMessage}`],
    };
  }
}
