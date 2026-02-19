/* eslint-disable no-console */
import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs/promises";
import { discoverSkills } from "../core/discovery.js";
import { InspectionReport } from "../core/types.js";
import { runInspectorWorkflow } from "../workflows/orchestrator.js";
import { logger } from "../core/logger.js";

export const program = new Command();

program
  .name("skill-inspector")
  .description("Inspect Agent Skills for quality, security, and compatibility")
  .version("0.1.0");

function printReport(report: InspectionReport, isJson: boolean) {
  if (isJson) {
    logger.info("Inspection complete", { report });
    return;
  }

  if (report.incomplete) {
    // Incomplete inspection - show warning
    console.log(
      `\n${chalk.bold("Overall Score:")} ${chalk.yellow("INCOMPLETE")}`,
    );
    console.log(`${chalk.bold("Summary:")} ${chalk.yellow(report.summary)}`);

    if (report.failedSteps && report.failedSteps.length > 0) {
      console.log(`\n${chalk.bold("Failed Steps:")}`);
      report.failedSteps.forEach((step) => {
        console.log(`  ${chalk.red("✗")} ${step}`);
      });
    }

    if (report.errors && report.errors.length > 0) {
      console.log(`\n${chalk.bold("Errors:")}`);
      report.errors.forEach((error) => {
        console.log(`  ${chalk.red(error)}`);
      });
    }

    if (report.findings.length > 0) {
      console.log(
        `\n${chalk.bold("Partial Findings (from completed steps):")}`,
      );
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
  } else {
    // Complete inspection
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
  .option(
    "--sandbox",
    "Clone remote repos in-memory (isomorphic-git + memfs) so no arbitrary repo files touch the host filesystem. Only SKILL.md content is written to a temp dir. Requires no extra setup — pure Node.js.",
    false,
  )
  .action(async (source = ".", options) => {
    // Configure logger
    logger.setJson(!!options.json);
    logger.setDebug(!!options.debug);

    let tempDir: string | undefined;
    try {
      logger.info(`Searching for skills in: ${source}...`);

      const discovery = await discoverSkills(source, {
        sandbox: !!options.sandbox,
      });
      const skills = discovery.skills;
      tempDir = discovery.tempDir;

      if (skills.length === 0) {
        logger.warn("No skills found.");
        return;
      }

      // Filter by skill name if -s provided
      let filteredSkills = skills;
      if (options.skill) {
        filteredSkills = skills.filter((s) => options.skill.includes(s.name));
      }

      if (options.list) {
        logger.success(`Found ${filteredSkills.length} skills:`);
        filteredSkills.forEach((s) =>
          console.log(`- ${chalk.bold(s.name)}: ${s.description}`),
        );
        return;
      }

      logger.info(`Inspecting ${filteredSkills.length} skills...`);

      for (const skill of filteredSkills) {
        if (!options.json) {
          console.log(
            `\n${chalk.white("--- Inspecting:")} ${chalk.bold(skill.name)} ${chalk.white("---")}`,
          );
        }

        logger.debug(`Starting inspection for skill: ${skill.name}`, {
          skillPath: skill.path,
        });

        const report = await runInspectorWorkflow(skill, !!options.debug, {
          provider: options.provider,
          model: options.model,
        });

        logger.info(`Finished inspection for skill: ${skill.name}`, {
          score: report.overallScore,
          findingsCount: report.findings.length,
        });

        printReport(report, !!options.json);
      }
    } catch (error: unknown) {
      logger.error("Inspection failed", error);
      process.exit(1);
    } finally {
      if (tempDir) {
        logger.debug(`Cleaning up temporary directory: ${tempDir}`);
        await fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
          logger.error(`Failed to cleanup temp directory ${tempDir}`, err);
        });
      }
    }
  });
