import { Agent } from "@mastra/core/agent";
import { InspectorModelConfig } from "../core/types.js";
import { z } from "zod";

/**
 * Creates a Mastra agent for skill inspection
 */
export function createInspectorAgent({
  name,
  instructions,
  model,
  tools,
}: {
  name: string;
  instructions: string;
  model: InspectorModelConfig;
  tools?: Record<string, unknown>;
}) {
  return new Agent({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    instructions: `${instructions}\n\nAlways report your findings clearly.`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
  });
}

/**
 * Common output schema for inspection agents
 */
export const InspectionOutputSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      message: z.string(),
      fix: z.string().optional().describe("Proposed fix if available"),
    }),
  ),
});

export type InspectionOutput = z.infer<typeof InspectionOutputSchema>;
