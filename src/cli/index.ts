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
  .version("0.2.0");

function printFindings(
  findings: InspectionReport["findings"],
  showCompliance: boolean,
) {
  findings.forEach((f) => {
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
    if (showCompliance && f.compliance && f.compliance.length > 0) {
      f.compliance.forEach((ref) => {
        const link = ref.url ? ` (${ref.url})` : "";
        console.log(
          `  ${chalk.cyan("↳")} ${chalk.cyan(`${ref.framework}: ${ref.id} — ${ref.name}`)}${chalk.gray(link)}`,
        );
      });
    }
  });
}

function printComplianceSummary(report: InspectionReport) {
  if (
    !report.complianceFrameworks ||
    report.complianceFrameworks.length === 0
  ) {
    console.log(chalk.green("  No compliance frameworks affected."));
    return;
  }
  report.complianceFrameworks.forEach((label) => {
    console.log(`  ${chalk.cyan("•")} ${label}`);
  });
}

function printReport(
  report: InspectionReport,
  isJson: boolean,
  showCompliance: boolean,
) {
  if (isJson) {
    logger.info("Inspection complete", { report });
    return;
  }

  if (report.incomplete) {
    // Incomplete inspection - show warning with score range
    const rangeStr = report.scoreRange
      ? ` (${report.scoreRange.min}–${report.scoreRange.max}/100)`
      : "";
    console.log(
      `\n${chalk.bold("Overall Score:")} ${chalk.yellow(`INCOMPLETE${rangeStr}`)}`,
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
      printFindings(report.findings, showCompliance);
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
    if (report.scoreBreakdown && report.findings.length > 0) {
      const { security, spec, compat } = report.scoreBreakdown;
      const parts = [];
      if (security > 0) parts.push(`Security -${security}pts`);
      if (spec > 0) parts.push(`Spec -${spec}pts`);
      if (compat > 0) parts.push(`Compat -${compat}pts`);
      if (parts.length > 0) {
        console.log(
          `${chalk.bold("Score Breakdown:")} ${chalk.gray(parts.join(", "))}`,
        );
      }
    }
    console.log(`${chalk.bold("Summary:")} ${report.summary}`);

    if (report.findings.length > 0) {
      console.log(`\n${chalk.bold("Findings:")}`);
      printFindings(report.findings, showCompliance);
    }

    if (showCompliance) {
      console.log(`\n${chalk.bold("Compliance Frameworks Affected:")}`);
      printComplianceSummary(report);
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
  .option(
    "--compliance",
    "Show compliance framework references (OWASP LLM Top 10, MITRE ATLAS) alongside each finding",
    false,
  )
  .option("--debug", "Show detailed agent logs and thoughts", false)
  .option("--stack-trace", "Show stack trace on error", false)
  .option(
    "--sandbox",
    "Clone remote repos in-memory (isomorphic-git + memfs) so no arbitrary repo files touch the host filesystem. Only SKILL.md content is written to a temp dir. Requires no extra setup — pure Node.js.",
    false,
  )
  .option(
    "--timeout <seconds>",
    "Timeout in seconds for each agent step (security, compat). Default: 120.",
    "120",
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

        const timeoutMs = Math.max(1, parseInt(options.timeout, 10)) * 1000;
        const report = await runInspectorWorkflow(
          skill,
          !!options.debug,
          { provider: options.provider, model: options.model },
          timeoutMs,
        );

        logger.info(`Finished inspection for skill: ${skill.name}`, {
          score: report.overallScore,
          findingsCount: report.findings.length,
        });

        printReport(report, !!options.json, !!options.compliance);
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
