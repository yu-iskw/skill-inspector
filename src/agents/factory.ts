import { Agent } from "@mastra/core/agent";
import { InspectorModelConfig } from "../core/types.js";
import { logger } from "../core/logger.js";
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
    model: (model.modelInstance || model) as any,
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

/**
 * Check if the provider is Google (which has limitations with structured outputs + function calling)
 */
function isGoogleProvider(modelConfig: InspectorModelConfig): boolean {
  return (
    modelConfig.provider === "GOOGLE" ||
    modelConfig.provider === "GOOGLE-VERTEX"
  );
}

/**
 * Generate with agent, handling Google's limitation with structured outputs + function calling.
 * For Google providers with tools, we parse JSON from text instead of using structured outputs.
 */
export async function generateWithStructuredOutput(
  agent: Agent,
  prompt: string,
  schema: z.ZodSchema<InspectionOutput>,
  modelConfig: InspectorModelConfig,
  hasTools: boolean,
): Promise<InspectionOutput> {
  // Google doesn't support structured outputs when function calling is enabled
  if (isGoogleProvider(modelConfig) && hasTools) {
    // Use a prompt-based approach to get JSON output
    const enhancedPrompt = `${prompt}

IMPORTANT: You must respond with ONLY valid JSON in this exact format:
{
  "findings": [
    {
      "severity": "low",
      "message": "description of the finding",
      "fix": "optional fix suggestion"
    }
  ]
}

Do not include any markdown formatting, code blocks, or explanatory text. Return only the JSON object.`;

    const result = await agent.generate(enhancedPrompt);
    const text = result.text;

    // Try to extract JSON from the response
    let jsonText = text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Try to find JSON object in the text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonText);
      return schema.parse(parsed);
    } catch (error) {
      // If parsing fails, throw error to surface failure to workflow
      const parseError =
        error instanceof Error ? error : new Error(String(error));
      const textSnippet =
        text.length > 200 ? `${text.substring(0, 200)}...` : text;
      logger.error(
        "Failed to parse JSON from Google provider response",
        parseError,
      );
      throw new Error(
        `Failed to parse JSON from Google provider response: ${parseError.message}. ` +
          `This may occur when the model drifts from the expected JSON format. ` +
          `Response snippet: ${textSnippet}`,
      );
    }
  }

  // For other providers or Google without tools, use structured outputs
  const result = await agent.generate(prompt, {
    structuredOutput: {
      schema,
    },
  });
  return result.object;
}
