import { z } from "zod";
import { createVertex } from "@ai-sdk/google-vertex";
import { InspectorModelConfig } from "./types.js";

export const LLMProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "groq",
  "mistral",
  "google-vertex",
  "anthropic-vertex",
]);

export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LLMConfigSchema = z.object({
  provider: LLMProviderSchema.default("openai"),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * Get the default model name for a given provider.
 * @param provider - The LLM provider.
 * @returns The default model identifier.
 */
function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-5.2";
    case "anthropic":
      return "claude-4.5-haiku@20260315";
    case "google":
      return "gemini-2.5-flash";
    case "google-vertex":
      return "gemini-2.5-flash";
    case "anthropic-vertex":
      return "claude-4.5-haiku@20260315";
    case "mistral":
      return "mistral-large-latest";
    case "groq":
      return "llama-4-70b";
    default:
      return "gpt-5.2";
  }
}

/**
 * Get model configuration, prioritizing explicit config over environment variables.
 * @param config - Optional partial LLM configuration.
 * @returns The final model configuration for the inspector.
 */
export function getModelConfig(
  config?: Partial<LLMConfig>,
): InspectorModelConfig {
  // 1. Resolve provider
  const provider =
    config?.provider || (process.env.LLM_PROVIDER as LLMProvider) || "openai";

  // 2. Resolve API key
  const apiKey = config?.apiKey || getEnvApiKey(provider);

  // 3. Resolve model
  const model =
    config?.model || process.env.LLM_MODEL || getDefaultModel(provider);

  // 4. Validate with schema
  const validated = LLMConfigSchema.parse({
    provider,
    apiKey,
    model,
    temperature: config?.temperature,
  });

  const modelConfig: InspectorModelConfig = {
    provider: validated.provider.toUpperCase(),
    name: validated.model!,
    apiKey: validated.apiKey,
  };

  // 5. Handle provider-specific extras
  if (provider === "google-vertex") {
    const projectId = process.env.GOOGLE_VERTEX_PROJECT;
    const location = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

    modelConfig.projectId = projectId;
    modelConfig.location = location;

    const vertex = createVertex({
      project: projectId,
      location,
    });

    modelConfig.modelInstance = vertex(validated.model!);
  } else if (provider === "anthropic-vertex") {
    modelConfig.projectId = process.env.GOOGLE_VERTEX_PROJECT;
    modelConfig.location = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";
  }

  return modelConfig;
}

/**
 * Get the API key from environment variables for a given provider.
 * @param provider - The LLM provider.
 * @returns The API key if found, otherwise undefined.
 */
function getEnvApiKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "google":
      return process.env.GOOGLE_API_KEY;
    case "mistral":
      return process.env.MISTRAL_API_KEY;
    case "groq":
      return process.env.GROQ_API_KEY;
    default:
      return undefined;
  }
}
