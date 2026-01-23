import { InspectorState, Finding } from "../core/types.js";
import { getChatModel } from "../core/llm.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import chalk from "chalk";

/**
 * Validates the skill against agentskills.io specification
 */
export async function specValidatorNode(
  state: InspectorState,
): Promise<Partial<InspectorState>> {
  if (!state.skill)
    return { errors: [...state.errors, "No skill to validate"] };

  if (state.debug)
    console.log(chalk.gray("[SpecValidator] Analyzing skill structure..."));

  const llm = state.model || getChatModel();
  const skill = state.skill;

  const prompt = `
Analyze the following Agent Skill for adherence to the "Agent Skills" specification (agentskills.io).

SKILL DATA:
Name: ${skill.name}
Description: ${skill.description}
Frontmatter: ${JSON.stringify(skill.frontmatter, null, 2)}
Content Snippet: ${skill.content.slice(0, 1000)}...

CHECKS:
1. Is the name 1-64 chars, lowercase, numbers, and hyphens?
2. Does the description accurately reflect the steps in the body?
3. Is there any ambiguity in the instructions?
4. Are required fields present?

Return your findings as a JSON array of objects:
[
  { "severity": "low" | "medium" | "high", "message": "string", "fix": "optional suggested fix" }
]
Only return the JSON.
`;

  try {
    const response = await llm.invoke([
      new SystemMessage(
        "You are a technical spec validator for AI Agent Skills.",
      ),
      new HumanMessage(prompt),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    // Extract JSON from potential markdown blocks
    const jsonStr = content.match(/\[[\s\S]*\]/)?.[0] || content;
    const rawFindings = JSON.parse(jsonStr) as Array<{
      severity: Finding["severity"];
      message: string;
      fix?: string;
    }>;

    const findings: Finding[] = rawFindings.map((f) => ({
      ...f,
      agent: "SpecValidator",
    }));

    return {
      findings: [...state.findings, ...findings],
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      errors: [...state.errors, `SpecValidator failed: ${errorMessage}`],
    };
  }
}
