/* eslint-disable no-console */
import { Command } from "commander";
import chalk from "chalk";
import { discoverSkills } from "../core/discovery.js";
import { InspectionReport } from "../core/types.js";
import { runInspectorWorkflow } from "../workflows/orchestrator.js";

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
  .option("-s, --skill <skills...>", "Only inspect specific skills by name")
  .option(
    "-p, --provider <provider>",
    "LLM provider (openai, anthropic, google, groq, mistral, google-vertex, anthropic-vertex)",
  )
  .option("-m, --model <model>", "Specific model ID to use")
  .option("--json", "Output results in JSON format")
  .option("--debug", "Show detailed agent logs and thoughts", false)
  .option("--stack-trace", "Show stack trace on error", false)
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

      for (const skill of filteredSkills) {
        console.log(
          chalk.white(`--- Inspecting: ${chalk.bold(skill.name)} ---`),
        );

        const report = await runInspectorWorkflow(skill, !!options.debug, {
          provider: options.provider,
          model: options.model,
        });

        printReport(report, !!options.json);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        if (options.stackTrace && error.stack) {
          console.error(chalk.gray(error.stack));
        }
      } else {
        console.error(chalk.red(`❌ Error: ${String(error)}`));
      }
      process.exit(1);
    }
  });
