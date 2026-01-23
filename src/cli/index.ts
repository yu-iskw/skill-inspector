import { Command } from "commander";
import chalk from "chalk";
import { discoverSkills } from "../core/discovery.js";
import { Skill, InspectionReport, InspectorState } from "../core/types.js";
import { createInspectorGraph } from "../workflows/orchestrator.js";
import { getChatModel } from "../core/llm.js";

export const program = new Command();

program
  .name("skill-inspector")
  .description("Inspect Agent Skills for quality, security, and compatibility")
  .version("0.1.0");

function printReport(report: InspectionReport, isJson: boolean) {
  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const color =
    report.overallScore > 80
      ? chalk.green
      : report.overallScore > 50
        ? chalk.yellow
        : chalk.red;

  console.log(
    `\n${chalk.bold("Overall Score:")} ${color(report.overallScore)}/100`,
  );
  console.log(`${chalk.bold("Summary:")} ${report.summary}`);

  if (report.findings.length > 0) {
    console.log(`\n${chalk.bold("Findings:")}`);
    report.findings.forEach((f) => {
      const severityColor =
        f.severity === "critical"
          ? chalk.bgRed.white
          : f.severity === "high"
            ? chalk.red
            : f.severity === "medium"
              ? chalk.yellow
              : chalk.blue;
      console.log(
        `- [${f.agent}] ${severityColor(f.severity.toUpperCase())}: ${f.message}`,
      );
      if (f.fix) console.log(`  ${chalk.gray("Fix:")} ${f.fix}`);
    });
  }
  console.log("\n" + chalk.gray("=".repeat(40)) + "\n");
}

program
  .command("inspect [source]")
  .description("Inspect one or more skills")
  .option("-l, --list", "List found skills without inspecting", false)
  .option("-g, --global", "Simulate global installation context", false)
  .option("-y, --yes", "Skip confirmation prompts", false)
  .option(
    "-a, --agent <agents...>",
    "Target specific agents for compatibility checks",
  )
  .option("-s, --skill <skills...>", "Only inspect specific skills by name")
  .option("--json", "Output results in JSON format")
  .option("--debug", "Show detailed agent logs and thoughts", false)
  .action(async (source = ".", options) => {
    try {
      console.log(chalk.blue(`🔍 Searching for skills in: ${source}...`));

      const skills = await discoverSkills(source);

      if (skills.length === 0) {
        console.log(chalk.yellow("⚠️ No skills found."));
        return;
      }

      // Filter by skill name if -s provided
      let filteredSkills = skills;
      if (options.skill) {
        filteredSkills = skills.filter((s) => options.skill.includes(s.name));
      }

      if (options.list) {
        console.log(chalk.green(`\nFound ${filteredSkills.length} skills:`));
        filteredSkills.forEach((s) =>
          console.log(`- ${chalk.bold(s.name)}: ${s.description}`),
        );
        return;
      }

      console.log(
        chalk.cyan(`\n🚀 Inspecting ${filteredSkills.length} skills...\n`),
      );

      const llm = await getChatModel();
      const graph = await createInspectorGraph(llm);

      for (const skill of filteredSkills) {
        console.log(
          chalk.white(`--- Inspecting: ${chalk.bold(skill.name)} ---`),
        );

        const initialState: InspectorState = {
          skillPath: skill.path,
          skill,
          messages: [],
          findings: [],
          score: 100,
          errors: [],
          model: llm,
          debug: !!options.debug,
        };

        let finalResults: InspectorState = initialState;

        // Use streaming for real-time updates
        const stream = await graph.stream(initialState, {
          streamMode: "values",
        });

        for await (const chunk of stream) {
          finalResults = chunk as InspectorState;
          if (options.debug) {
            // Find which node updated by comparing messages or using metadata if available
            // For now, just show it's progressing in debug mode
            console.log(
              chalk.gray(
                `[State Update] ${finalResults.messages.length} messages, ${finalResults.findings.length} findings`,
              ),
            );
          } else {
            process.stdout.write(chalk.blue("."));
          }
        }

        const report: InspectionReport = {
          skillName: skill.name,
          overallScore: finalResults.score, // This is simplified, orchestrator has better heuristic
          findings: finalResults.findings,
          summary:
            finalResults.findings.length === 0
              ? "No issues found."
              : `Found ${finalResults.findings.length} issues.`,
          timestamp: new Date().toISOString(),
        };

        // Recalculate score with heuristic (shared logic with orchestrator)
        let finalScore = 100;
        for (const f of finalResults.findings) {
          if (f.severity === "critical") finalScore -= 50;
          else if (f.severity === "high") finalScore -= 25;
          else if (f.severity === "medium") finalScore -= 10;
          else if (f.severity === "low") finalScore -= 2;
        }
        report.overallScore = Math.max(0, finalScore);
        report.summary =
          finalResults.findings.length === 0
            ? "No issues found. Skill looks safe and compliant."
            : `Found ${finalResults.findings.length} potential issues across multiple agents.`;

        console.log(""); // newline after dots
        printReport(report, !!options.json);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ Error: ${errorMessage}`));
      process.exit(1);
    }
  });
