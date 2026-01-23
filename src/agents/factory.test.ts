import { describe, it, expect } from "vitest";
import { createInspectorAgent } from "./factory.js";
import { Agent } from "@mastra/core/agent";

describe("agent factory", () => {
  const model = { provider: "OPENAI", name: "gpt-4o-mini" };

  it("should create a Mastra Agent instance", () => {
    const agent = createInspectorAgent({
      name: "TestAgent",
      instructions: "You are a tester",
      model,
    });

    expect(agent).toBeInstanceOf(Agent);
    expect(agent.name).toBe("TestAgent");
  });

  it("should create an agent with tools", () => {
    const mockTool = { id: "testTool", execute: async () => ({}) };
    const agent = createInspectorAgent({
      name: "TestAgent",
      instructions: "You are a tester",
      model,
      tools: { testTool: mockTool },
    });

    expect(agent).toBeInstanceOf(Agent);
  });
});
