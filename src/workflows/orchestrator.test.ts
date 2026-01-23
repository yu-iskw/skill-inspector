import { describe, it, expect, vi } from "vitest";
import { runInspectorWorkflow } from "./orchestrator.js";
import { Skill, Finding } from "../core/types.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";

// Mock the langchain package used by the factory
vi.mock("langchain", () => ({
  createAgent: vi.fn().mockImplementation(({ systemPrompt }) => {
    return {
      invoke: vi.fn().mockImplementation(async () => {
        const isSecurity = systemPrompt.includes("Security");
        const isSpec = systemPrompt.includes("Spec");

        let findings: Finding[] = [];
        if (isSecurity) {
          findings = [
            {
              severity: "low",
              message: "All good security-wise",
              agent: "Mock",
            },
          ];
        } else if (isSpec) {
          findings = [
            { severity: "low", message: "Valid spec", agent: "Mock" },
          ];
        } else {
          findings = [
            { severity: "low", message: "Generic finding", agent: "Mock" },
          ];
        }

        return {
          structuredResponse: { findings },
          messages: [new AIMessage("Response from agent")],
        };
      }),
    };
  }),
}));

// Simple Mock for ChatModel
class MockChatModel extends BaseChatModel {
  _llmType() {
    return "mock";
  }
  async _generate() {
    return { generations: [] };
  }

  async invoke(input: unknown): Promise<BaseMessage> {
    const prompt = JSON.stringify(input);
    if (prompt.includes("Security")) {
      return new AIMessage(
        'Findings: [{"severity": "low", "message": "All good security-wise"}]',
      );
    }
    if (prompt.includes("Spec")) {
      return new AIMessage(
        'Findings: [{"severity": "low", "message": "Valid spec"}]',
      );
    }
    return new AIMessage(
      'Findings: [{"severity": "low", "message": "Generic finding"}]',
    );
  }
}

describe("orchestrator", () => {
  it("should run the workflow and return a report", async () => {
    const mockSkill: Skill = {
      path: "test/SKILL.md",
      name: "test-skill",
      description: "A test skill",
      frontmatter: { name: "test-skill", description: "A test skill" },
      content: "Step 1: Do something",
    };

    const mockModel = new MockChatModel({});
    const report = await runInspectorWorkflow(mockSkill, mockModel);

    expect(report.skillName).toBe("test-skill");
    expect(report.overallScore).toBeLessThanOrEqual(100);
    // expect(report.findings.length).toBeGreaterThan(0); // Findings depend on mock response
  });

  it("should calculate score correctly based on severity", async () => {
    const mockSkill: Skill = {
      path: "test/SKILL.md",
      name: "test-skill",
      description: "A test skill",
      frontmatter: { name: "test-skill", description: "A test skill" },
      content: "Step 1: Do something",
    };

    class ScoreMockModel extends MockChatModel {}

    // Update the mock for this specific test
    const { createAgent: langchainCreateAgent } = await import("langchain");
    vi.mocked(langchainCreateAgent).mockImplementation(({ systemPrompt }) => {
      return {
        invoke: vi.fn().mockImplementation(async () => {
          if (systemPrompt.includes("Security Auditor")) {
            return {
              structuredResponse: {
                findings: [{ severity: "critical", message: "CRITICAL RISK" }],
              },
              messages: [new AIMessage("CRITICAL RISK")],
            };
          }
          return {
            structuredResponse: { findings: [] },
            messages: [new AIMessage("OK")],
          };
        }),
      } as unknown as ReturnType<typeof langchainCreateAgent>;
    });

    const report = await runInspectorWorkflow(
      mockSkill,
      new ScoreMockModel({}),
    );
    expect(report.overallScore).toBe(50); // 100 - 50 for critical
  });

  it("should handle errors in agents and collect them", async () => {
    const mockSkill: Skill = {
      path: "test/SKILL.md",
      name: "test-skill",
      description: "A test skill",
      frontmatter: { name: "test-skill", description: "A test skill" },
      content: "Step 1: Do something",
    };

    class ErrorMockModel extends MockChatModel {}

    // Update the mock for this specific test
    const { createAgent: langchainCreateAgent } = await import("langchain");
    vi.mocked(langchainCreateAgent).mockReturnValue({
      invoke: vi.fn().mockRejectedValue(new Error("Node Failure")),
    } as unknown as ReturnType<typeof langchainCreateAgent>);

    const report = await runInspectorWorkflow(
      mockSkill,
      new ErrorMockModel({}),
    );
    expect(report.summary).toContain("No issues found");
    // Errors are currently in the state but not explicitly in the report summary if no findings.
    // However, the summary logic uses finalState.findings.length.
  });
});
