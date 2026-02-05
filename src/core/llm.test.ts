import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getModelConfig } from "./llm.js";

describe("llm factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return openai by default", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const config = getModelConfig();
    expect(config.provider).toBe("OPENAI");
    expect(config.name).toBe("gpt-4o-mini");
    expect(config.apiKey).toBe("test-key");
  });

  it("should return anthropic when provider is set to anthropic", () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const config = getModelConfig();
    expect(config.provider).toBe("ANTHROPIC");
    expect(config.name).toBe("claude-3-5-haiku-latest");
  });

  it("should return google when provider is set to google", () => {
    process.env.LLM_PROVIDER = "google";
    process.env.GOOGLE_API_KEY = "test-key";
    const config = getModelConfig();
    expect(config.provider).toBe("GOOGLE");
    expect(config.name).toBe("gemini-2.0-flash");
  });

  it("should respect explicit config over environment variables", () => {
    process.env.LLM_PROVIDER = "openai";
    const config = getModelConfig({
      provider: "anthropic",
      apiKey: "explicit-key",
    });
    expect(config.provider).toBe("ANTHROPIC");
    expect(config.apiKey).toBe("explicit-key");
  });

  it("should return google-vertex when provider is set to google-vertex", () => {
    process.env.LLM_PROVIDER = "google-vertex";
    process.env.GOOGLE_VERTEX_PROJECT = "test-project";
    process.env.GOOGLE_VERTEX_LOCATION = "us-east1";
    const config = getModelConfig();
    expect(config.provider).toBe("GOOGLE-VERTEX");
    expect(config.name).toBe("gemini-2.0-flash");
    expect(config.projectId).toBe("test-project");
    expect(config.location).toBe("us-east1");
  });

  it("should return anthropic-vertex when provider is set to anthropic-vertex", () => {
    process.env.LLM_PROVIDER = "anthropic-vertex";
    process.env.GOOGLE_VERTEX_PROJECT = "test-project";
    const config = getModelConfig();
    expect(config.provider).toBe("ANTHROPIC-VERTEX");
    expect(config.name).toBe("claude-3-5-haiku-latest");
    expect(config.projectId).toBe("test-project");
    expect(config.location).toBe("us-central1"); // Default
  });

  it("should return mock when provider is set to mock", () => {
    const config = getModelConfig({ provider: "mock" });
    expect(config.provider).toBe("MOCK");
    expect(config.name).toBe("mock-model");
    expect(config.apiKey).toBeUndefined();
  });
});
