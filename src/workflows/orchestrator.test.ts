import { describe, it, expect, vi } from "vitest";
import { runInspectorWorkflow } from "./orchestrator.js";
import { Skill } from "../core/types.js";

// Mock Mastra Agent
vi.mock("@mastra/core/agent", () => {
  return {
    Agent: vi.fn().mockImplementation(function ({ name }) {
      return {
        name,
        generate: vi.fn().mockImplementation(async () => {
          if (name === "SpecAgent") {
            return {
              object: {
                findings: [{ severity: "low", message: "Spec finding" }],
              },
            };
          }
          if (name === "SecurityAuditor") {
            return {
              object: {
                findings: [{ severity: "high", message: "Security finding" }],
              },
            };
          }
          return {
            object: {
              findings: [],
            },
          };
        }),
      };
    }),
  };
});

// We don't need to mock Workflow if we mock Agent,
// as the real Workflow will use the mocked Agent.
// But we might need to mock createStep to avoid real execution issues if any.
// Actually, Mastra's Workflow/Step are fine to run in tests if dependencies are mocked.

vi.mock("@mastra/core/tools", () => ({
  createTool: vi.fn().mockImplementation((config) => config),
}));

describe("orchestrator", () => {
  it("should run the workflow and return a report", async () => {
    const mockSkill: Skill = {
      path: "test-skill/SKILL.md",
      name: "test-skill",
      description: "A test skill",
      frontmatter: { name: "test-skill", description: "A test skill" },
      content: "Step 1: Do something",
    };

    const report = await runInspectorWorkflow(mockSkill, false, {
      provider: "mock",
    });

    expect(report.skillName).toBe("test-skill");
    expect(report.overallScore).toBe(75); // 100 - 25 for high (SecurityAuditor)
    expect(report.findings).toHaveLength(1);

    const agents = report.findings.map((f) => f.agent);
    expect(agents).not.toContain("SpecAgent");
    expect(agents).toContain("SecurityAudit");
  });
});
