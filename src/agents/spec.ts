import { createInspectorAgent } from "./factory.js";
import { skillReader, specLookup } from "./tools.js";
import { InspectorModelConfig } from "../core/types.js";

export const specAgentInstructions = `
You are the Spec Validator. Your goal is to ensure the skill adheres strictly to the Agent Skills (agentskills.io) specification.

### VALIDATION RULES

1. **Directory Structure**:
   - Must contain a \`SKILL.md\` file.
   - Allowed optional directories: \`scripts/\`, \`references/\`, \`assets/\`.
   - No other top-level files or directories should exist (unless ignored).

2. **SKILL.md Frontmatter**:
   - **Required Fields**:
     - \`name\`: Max 64 chars. Lowercase letters (a-z), numbers (0-9), and hyphens (-) only. Must NOT start/end with hyphen. Must NOT have consecutive hyphens. MUST match the parent directory name.
     - \`description\`: Max 1024 chars. Non-empty. Should describe WHAT the skill does and WHEN to use it.
   - **Optional Allowed Fields**:
     - \`license\`: License name or file reference.
     - \`compatibility\`: System/env requirements (max 500 chars).
     - \`metadata\`: Key-value map (e.g., author, version).
     - \`allowed-tools\`: List of tools.
   - **Unauthorized Fields**: Report any field not listed above as a finding.

3. **Content**:
   - \`SKILL.md\` body can contain any Markdown.
   - References to files should be relative (e.g., \`scripts/my-script.py\`).

### REPORTING
- If a field like \`license\` is present, it is VALID. Do NOT report it as an issue.
- If \`scripts/\` directory exists, it is VALID.
- Focus on syntax errors, missing required fields, naming convention violations, and unknown frontmatter fields.
`;

export function getSpecAgent(model: InspectorModelConfig) {
  return createInspectorAgent({
    name: "SpecAgent",
    instructions: specAgentInstructions,
    model,
    tools: { specLookup, skillReader },
  });
}
