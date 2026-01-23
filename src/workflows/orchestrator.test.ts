import { describe, it, expect, vi } from "vitest";
import { runInspectorWorkflow } from "./orchestrator.js";
import { Skill } from "../core/types.js";

// Mock Mastra
vi.mock("@mastra/core/agent", () => {
  return {
    Agent: vi.fn().mockImplementation(function () {
      return {
        name: "MockAgent",
        generate: vi.fn().mockResolvedValue({
          object: {
            findings: [{ severity: "low", message: "Mock finding" }],
          },
        }),
      };
    }),
  };
});

vi.mock("@mastra/core/workflows", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    Workflow: vi.fn().mockImplementation(function (config) {
      const workflow = new actual.Workflow(config);
      workflow.execute = vi.fn().mockResolvedValue({
        results: {
          spec: {
            findings: [
              {
                severity: "low",
                message: "Spec finding",
                agent: "SpecAgent",
              },
            ],
          },
          security: {
            findings: [
              {
                severity: "high",
                message: "Security finding",
                agent: "SecurityAuditor",
              },
            ],
          },
          compatibility: { findings: [] },
        },
      });
      return workflow;
    }),
  };
});

vi.mock("@mastra/core/tools", () => ({
  createTool: vi.fn().mockImplementation((config) => config),
}));

describe("orchestrator", () => {
  it("should run the workflow and return a report", async () => {
    const mockSkill: Skill = {
      path: "test/SKILL.md",
      name: "test-skill",
      description: "A test skill",
      frontmatter: { name: "test-skill", description: "A test skill" },
      content: "Step 1: Do something",
    };

    const report = await runInspectorWorkflow(mockSkill);

    expect(report.skillName).toBe("test-skill");
    expect(report.overallScore).toBe(73); // 100 - 2 for low - 25 for high
    expect(report.findings).toHaveLength(2);
  });
});
