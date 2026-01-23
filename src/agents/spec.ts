import { createInspectorAgent } from "./factory.js";
import { skillReader, specLookup } from "./tools.js";
import { InspectorModelConfig } from "../core/types.js";

export const specAgentInstructions = `
You are the Spec Validator. Your goal is to ensure the skill adheres strictly to agentskills.io.
Check frontmatter, naming conventions, and description accuracy.
`;

export function getSpecAgent(model: InspectorModelConfig) {
  return createInspectorAgent({
    name: "SpecAgent",
    instructions: specAgentInstructions,
    model,
    tools: { specLookup, skillReader },
  });
}
