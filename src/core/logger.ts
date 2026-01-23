import chalk from "chalk";
import os from "node:os";

export type LogLevel = "info" | "warn" | "error" | "debug" | "success";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  user: string;
  context?: Record<string, unknown>;
  error?: Error | unknown;
}

export class Logger {
  private isJson: boolean;
  private isDebug: boolean;
  private user: string;

  constructor(options: { isJson?: boolean; isDebug?: boolean } = {}) {
    this.isJson = options.isJson ?? false;
    this.isDebug = options.isDebug ?? false;
    try {
      this.user = os.userInfo().username;
    } catch {
      this.user = "unknown";
    }
  }

  setJson(isJson: boolean) {
    this.isJson = isJson;
  }

  setDebug(isDebug: boolean) {
    this.isDebug = isDebug;
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log("warn", message, context);
  }

  error(
    message: string,
    error?: Error | unknown,
    context?: Record<string, unknown>,
  ) {
    this.log("error", message, context, error);
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (this.isDebug) {
      this.log("debug", message, context);
    }
  }

  success(message: string, context?: Record<string, unknown>) {
    this.log("success", message, context);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error | unknown,
  ) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      user: this.user,
      context,
    };

    if (error) {
      if (error instanceof Error) {
        entry.error = {
          message: error.message,
          stack: error.stack,
          name: error.name,
        };
      } else {
        entry.error = error;
      }
    }

    if (this.isJson) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    } else {
      this.printToConsole(entry);
    }
  }

  private printToConsole(entry: LogEntry) {
    const { level, message, context, error } = entry;

    let prefix = "";
    switch (level) {
      case "info":
        prefix = chalk.blue("info");
        break;
      case "warn":
        prefix = chalk.yellow("warn");
        break;
      case "error":
        prefix = chalk.red("error");
        break;
      case "debug":
        prefix = chalk.gray("debug");
        break;
      case "success":
        prefix = chalk.green("success");
        break;
    }

    let output = `${prefix}: ${message}`;

    if (context && Object.keys(context).length > 0) {
      output += ` ${chalk.gray(JSON.stringify(context))}`;
    }

    if (level === "error") {
      // eslint-disable-next-line no-console
      console.error(output);
      if (error) {
        if (
          error instanceof Error ||
          (typeof error === "object" && error !== null && "message" in error)
        ) {
          const errMsg =
            (error as { message?: string }).message || String(error);
          // eslint-disable-next-line no-console
          console.error(chalk.red(`  ${errMsg}`));
          if (this.isDebug && (error as { stack?: string }).stack) {
            // eslint-disable-next-line no-console
            console.error(chalk.gray((error as { stack?: string }).stack));
          }
        } else {
          // eslint-disable-next-line no-console
          console.error(chalk.red(`  ${String(error)}`));
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(output);
    }
  }
}

export const logger = new Logger();
