import { z } from "zod";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { InspectorModelConfig } from "./types.js";

export const LLMProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "groq",
  "mistral",
  "google-vertex",
  "anthropic-vertex",
  "mock",
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
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "google":
      return "gemini-2.0-flash";
    case "google-vertex":
      return "gemini-2.0-flash";
    case "anthropic-vertex":
      return "claude-3-5-haiku-latest";
    case "mistral":
      return "mistral-small-latest";
    case "groq":
      return "llama-3.1-8b-instant";
    case "mock":
      return "mock-model";
    default:
      return "gpt-4o-mini";
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

  const providersRequiringApiKey: Array<LLMProvider> = [
    "openai",
    "anthropic",
    "google",
    "groq",
    "mistral",
  ];

  if (
    provider !== "mock" &&
    providersRequiringApiKey.includes(provider) &&
    !apiKey
  ) {
    throw new Error(
      `Missing API key for provider '${provider}'. Set the appropriate environment variable or pass 'apiKey' in config.`,
    );
  }

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

  // 5. Create model instances for all providers
  if (provider === "google") {
    const googleProvider = createGoogleGenerativeAI({
      apiKey: validated.apiKey!,
    });
    modelConfig.modelInstance = googleProvider(validated.model!);
  } else if (provider === "anthropic") {
    const anthropicProvider = createAnthropic({
      apiKey: validated.apiKey!,
    });
    modelConfig.modelInstance = anthropicProvider(validated.model!);
  } else if (provider === "openai") {
    const openaiProvider = createOpenAI({
      apiKey: validated.apiKey!,
    });
    modelConfig.modelInstance = openaiProvider(validated.model!);
  } else if (provider === "groq") {
    const groqProvider = createGroq({
      apiKey: validated.apiKey!,
    });
    modelConfig.modelInstance = groqProvider(validated.model!);
  } else if (provider === "mistral") {
    const mistralProvider = createMistral({
      apiKey: validated.apiKey!,
    });
    modelConfig.modelInstance = mistralProvider(validated.model!);
  } else if (provider === "google-vertex") {
    const projectId = process.env.GOOGLE_VERTEX_PROJECT;
    const location = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

    modelConfig.projectId = projectId;
    modelConfig.location = location;

    if (!projectId) {
      throw new Error(
        "Google Vertex project ID is missing. Please set the GOOGLE_VERTEX_PROJECT environment variable or pass it in the config.",
      );
    }

    const vertex = createVertex({
      project: projectId,
      location,
    });

    modelConfig.modelInstance = vertex(validated.model!);
  } else if (provider === "anthropic-vertex") {
    const projectId = process.env.GOOGLE_VERTEX_PROJECT;
    const location = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

    if (!projectId) {
      throw new Error(
        "Google Vertex project ID is missing. Please set the GOOGLE_VERTEX_PROJECT environment variable.",
      );
    }

    modelConfig.projectId = projectId;
    modelConfig.location = location;

    const vertexAnthropic = createVertexAnthropic({
      project: projectId,
      location,
    });

    modelConfig.modelInstance = vertexAnthropic(validated.model!);
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
