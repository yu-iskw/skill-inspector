import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain/chat_models/universal";
import { InMemoryCache } from "@langchain/core/caches";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { LLMResult } from "@langchain/core/outputs";
import { z } from "zod";

export const LLMProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google-genai",
  "google-vertex",
  "ollama",
  "local",
  "deepseek",
  "mistral",
  "groq",
  "cohere",
  "azure-openai",
  "bedrock",
]);

export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LLMConfigSchema = z.object({
  provider: LLMProviderSchema.default("openai"),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0),
  project: z.string().optional(), // For Vertex AI
  location: z.string().optional(), // For Vertex AI
  maxRetries: z.number().min(0).default(2),
  cache: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "google-genai":
    case "google-vertex":
      return "gemini-2.0-flash-lite";
    case "ollama":
    case "local":
      return "llama3.2:1b";
    case "deepseek":
      return "deepseek-chat";
    case "mistral":
      return "open-mistral-nemo";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "cohere":
      return "command-light";
    case "azure-openai":
      return "gpt-4o-mini";
    case "bedrock":
      return "anthropic.claude-3-5-haiku-20241022-v1:0";
    default:
      return "gpt-4o-mini";
  }
}

function mapProvider(provider: LLMProvider): string {
  switch (provider) {
    case "google-genai":
      return "google_genai";
    case "google-vertex":
      return "google_vertexai";
    case "local":
      return "openai";
    case "mistral":
      return "mistralai";
    case "azure-openai":
      return "azure_openai";
    default:
      return provider;
  }
}

const globalCache = new InMemoryCache();

/**
 * Get a ChatModel based on configuration or environment variables
 */
export async function getChatModel(
  config?: Partial<LLMConfig>,
  customModel?: BaseChatModel,
): Promise<BaseChatModel> {
  if (customModel) return customModel;

  // 1. Resolve configuration with defaults and env vars
  const provider =
    config?.provider || (process.env.LLM_PROVIDER as LLMProvider) || "openai";

  const resolvedConfig = LLMConfigSchema.parse({
    provider,
    model: config?.model || process.env.LLM_MODEL || getDefaultModel(provider),
    apiKey: config?.apiKey || getEnvApiKey(provider),
    baseUrl: config?.baseUrl || getEnvBaseUrl(provider),
    temperature: config?.temperature ?? 0,
    maxRetries: config?.maxRetries ?? 2,
    project: config?.project || process.env.GOOGLE_VERTEX_PROJECT,
    location: config?.location || process.env.GOOGLE_VERTEX_LOCATION,
    cache: config?.cache ?? false,
    metadata: config?.metadata,
  });

  // 2. Initialize model using LangChain universal factory
  const modelProvider = mapProvider(resolvedConfig.provider);

  const modelOptions: Record<string, unknown> = {
    modelProvider,
    temperature: resolvedConfig.temperature,
    maxRetries: resolvedConfig.maxRetries,
  };

  if (resolvedConfig.apiKey) {
    modelOptions.apiKey = resolvedConfig.apiKey;
  }

  if (resolvedConfig.baseUrl) {
    modelOptions.configuration = { baseURL: resolvedConfig.baseUrl };
  }

  if (resolvedConfig.provider === "google-vertex") {
    modelOptions.project = resolvedConfig.project;
    modelOptions.location = resolvedConfig.location;
  }

  // 3. Create the model
  let model = (await initChatModel(
    resolvedConfig.model!,
    modelOptions,
  )) as BaseChatModel;

  // 4. Add caching if requested
  if (resolvedConfig.cache) {
    model = model.withConfig({
      cache: globalCache,
    });
  }

  // 5. Add metadata and configuration
  if (resolvedConfig.metadata) {
    model = model.withConfig({
      metadata: resolvedConfig.metadata,
    });
  }

  return model as BaseChatModel;
}

function getEnvApiKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "google-genai":
      return process.env.GOOGLE_API_KEY;
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
    case "mistral":
      return process.env.MISTRAL_API_KEY;
    case "groq":
      return process.env.GROQ_API_KEY;
    case "cohere":
      return process.env.COHERE_API_KEY;
    case "azure-openai":
      return process.env.AZURE_OPENAI_API_KEY;
    default:
      return undefined;
  }
}

function getEnvBaseUrl(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_BASE_URL;
    case "ollama":
    case "local":
      return process.env.LOCAL_LLM_BASE_URL || "http://localhost:11434/v1";
    case "deepseek":
      return process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    case "azure-openai":
      return process.env.AZURE_OPENAI_BASE_URL;
    default:
      return undefined;
  }
}

/**
 * Callback handler to track token usage across multiple LLM calls
 */
export class TokenUsageTracker extends BaseCallbackHandler {
  name = "token_usage_tracker";

  usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  async handleLLMEnd(output: LLMResult) {
    const usage = output.llmOutput?.tokenUsage as
      | {
          promptTokens?: number;
          prompt_tokens?: number;
          completionTokens?: number;
          completion_tokens?: number;
          totalTokens?: number;
          total_tokens?: number;
        }
      | undefined;
    if (usage) {
      this.usage.promptTokens += usage.promptTokens || usage.prompt_tokens || 0;
      this.usage.completionTokens +=
        usage.completionTokens || usage.completion_tokens || 0;
      this.usage.totalTokens += usage.totalTokens || usage.total_tokens || 0;
    }
  }
}

/**
 * Creates a model with an attached token usage tracker
 */
export function withTokenUsage(
  model: BaseChatModel,
  tracker: TokenUsageTracker,
): BaseChatModel {
  return model.withConfig({
    callbacks: [tracker],
  }) as unknown as BaseChatModel;
}
