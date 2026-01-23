import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getChatModel } from "./llm.js";

// Mock universal initChatModel
vi.mock("langchain/chat_models/universal", () => ({
  initChatModel: vi.fn(async (model, options) => {
    return {
      model,
      options,
      _llmType: () => options.modelProvider,
      withConfig: vi.fn().mockReturnThis(),
    };
  }),
}));

interface MockChatModelResult {
  model: string;
  options: {
    modelProvider: string;
    configuration?: { baseURL: string };
    metadata?: Record<string, unknown>;
  };
  _llmType: () => string;
  withConfig: ReturnType<typeof vi.fn>;
}

describe("llm factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return openai by default", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("openai");
    expect(model.model).toBe("gpt-4o-mini");
  });

  it("should return anthropic when provider is set to anthropic", async () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("anthropic");
    expect(model.model).toBe("claude-3-5-haiku-latest");
  });

  it("should return google_genai when provider is set to google-genai", async () => {
    process.env.LLM_PROVIDER = "google-genai";
    process.env.GOOGLE_API_KEY = "test-key";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("google_genai");
  });

  it("should return google_vertexai when provider is set to google-vertex", async () => {
    process.env.LLM_PROVIDER = "google-vertex";
    process.env.GOOGLE_VERTEX_PROJECT = "test-project";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("google_vertexai");
  });

  it("should return openai with custom base URL for ollama", async () => {
    process.env.LLM_PROVIDER = "ollama";
    process.env.LOCAL_LLM_BASE_URL = "http://localhost:1234/v1";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("ollama"); // MapProvider maps ollama to ollama
    expect(model.options.configuration?.baseURL).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("should respect explicit config over environment variables", async () => {
    process.env.LLM_PROVIDER = "openai";
    const model = (await getChatModel({
      provider: "anthropic",
      apiKey: "explicit-key",
    })) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("anthropic");
  });

  it("should return customModel if provided", async () => {
    const mockModel = { _llmType: () => "mock" } as unknown as BaseChatModel;
    const model = await getChatModel({}, mockModel);
    expect(model).toBe(mockModel);
  });

  it("should return deepseek when provider is set to deepseek", async () => {
    process.env.LLM_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "test-key";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("deepseek");
    expect(model.model).toBe("deepseek-chat");
  });

  it("should return mistralai when provider is set to mistral", async () => {
    process.env.LLM_PROVIDER = "mistral";
    process.env.MISTRAL_API_KEY = "test-key";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("mistralai");
    expect(model.model).toBe("open-mistral-nemo");
  });

  it("should return groq when provider is set to groq", async () => {
    process.env.LLM_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-key";
    const model = (await getChatModel()) as unknown as MockChatModelResult;
    expect(model._llmType()).toBe("groq");
    expect(model.model).toBe("llama-3.3-70b-versatile");
  });

  it("should attach metadata when provided", async () => {
    const metadata = { agentName: "test-agent" };
    const model = (await getChatModel({
      metadata,
    })) as unknown as MockChatModelResult;
    expect(model.withConfig).toHaveBeenCalledWith({
      metadata: expect.objectContaining(metadata),
    });
  });
});
