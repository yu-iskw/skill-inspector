import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgent } from "./factory.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent as langchainCreateAgent } from "langchain";
import { InspectorState } from "../core/types.js";

// Mock the langchain package
vi.mock("langchain", () => ({
  createAgent: vi.fn(),
}));

class MockModel extends BaseChatModel {
  _llmType() {
    return "mock";
  }
  async _generate() {
    return { generations: [] };
  }
  bindTools() {
    return this;
  }
}

describe("agent factory", () => {
  const model = new MockModel({});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create an agent node that returns findings from structuredResponse", async () => {
    const mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        structuredResponse: {
          findings: [{ severity: "low", message: "test finding" }],
        },
        messages: [new HumanMessage("initial"), new AIMessage("response")],
      }),
    };
    vi.mocked(langchainCreateAgent).mockReturnValue(
      mockAgent as unknown as ReturnType<typeof langchainCreateAgent>,
    );

    const agentNode = createAgent(model, [], "You are a tester", "TestAgent");

    const state: InspectorState = {
      skill: {
        name: "test",
        content: "test content",
        path: "test/path",
        description: "test description",
        frontmatter: { name: "test", description: "test description" },
      },
      skillPath: "test/path",
      messages: [],
      findings: [],
      score: 100,
      errors: [],
      model,
      debug: false,
    };

    const result = await agentNode(state);

    expect(result.findings).toHaveLength(1);
    expect(result.findings![0].agent).toBe("TestAgent");
    expect(result.findings![0].message).toBe("test finding");
    // inputMessages.length was 1 (the auto-injected HumanMessage)
    // result.messages was length 2. slice(1) should be length 1.
    expect(result.messages).toHaveLength(1);
    expect(langchainCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(Object),
        systemPrompt: expect.stringContaining("You are a tester"),
        responseFormat: expect.any(Object),
      }),
    );
  });

  it("should catch errors and return them in state", async () => {
    const mockAgent = {
      invoke: vi.fn().mockRejectedValue(new Error("API Down")),
    };
    vi.mocked(langchainCreateAgent).mockReturnValue(
      mockAgent as unknown as ReturnType<typeof langchainCreateAgent>,
    );

    const agentNode = createAgent(model, [], "You are a tester", "TestAgent");

    const state: InspectorState = {
      skill: {
        name: "test",
        content: "test content",
        path: "test/path",
        description: "test description",
        frontmatter: { name: "test", description: "test description" },
      },
      skillPath: "test/path",
      messages: [],
      findings: [],
      errors: [],
      score: 100,
      model,
      debug: false,
    };

    const result = await agentNode(state);
    expect(result.errors).toContain("Agent TestAgent failed: API Down");
  });
});
