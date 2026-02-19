import Docker from "dockerode";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

// Read the package version at runtime so the image tag always matches the
// installed npm package, regardless of which version the user has installed.
const __dirname = dirname(fileURLToPath(import.meta.url));
const { version: PKG_VERSION } = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf8"),
) as { version: string };

/**
 * The container image used for sandbox mode.
 * The tag is pinned to the installed package version so that the npm package
 * and the container image are always in sync.
 * Override via SKILL_INSPECTOR_SANDBOX_IMAGE env var (e.g. for local builds).
 */
const SANDBOX_IMAGE =
  process.env.SKILL_INSPECTOR_SANDBOX_IMAGE ??
  `ghcr.io/yu-iskw/skill-inspector:${PKG_VERSION}`;

/**
 * LLM provider API key env vars forwarded into the container.
 * Only these vars are passed — the full host environment is never exposed.
 */
const API_KEY_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_VERTEX_PROJECT",
  "GOOGLE_VERTEX_LOCATION",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
];

export class DockerNotAvailableError extends Error {
  constructor() {
    super(
      "Docker daemon is not accessible. " +
        "Ensure Docker is running and the socket at /var/run/docker.sock is accessible.\n" +
        "Tip: run without --sandbox to inspect locally.",
    );
    this.name = "DockerNotAvailableError";
  }
}

/** Returns true if the image is already present in the local Docker image cache. */
async function imageExists(docker: Docker, image: string): Promise<boolean> {
  try {
    await docker.getImage(image).inspect();
    return true;
  } catch {
    return false;
  }
}

/** Pull an image, streaming progress to the logger. */
async function pullImage(docker: Docker, image: string): Promise<void> {
  logger.info(`Pulling sandbox image: ${image} ...`);
  await new Promise<void>((resolve, reject) => {
    // docker.pull uses the callback form; modem.followProgress waits for completion
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

/**
 * Run the skill inspection inside an ephemeral, isolated Docker container.
 *
 * Security properties of the container:
 *  - All Linux capabilities dropped (CapDrop: ALL)
 *  - No privilege escalation (no-new-privileges)
 *  - Root filesystem is read-only; only /tmp is writable (for git clone temp dirs)
 *  - Only explicitly listed API key env vars are forwarded; the host env is never exposed
 *  - Container is auto-removed on exit (AutoRemove: true)
 *
 * stdout and stderr are piped directly to the host terminal so the user sees
 * live output. The process exits with the container's exit code.
 */
export async function runInSandbox(
  source: string,
  forwardedArgs: string[],
): Promise<void> {
  // 1. Connect to the Docker daemon (defaults to /var/run/docker.sock)
  let docker: Docker;
  try {
    docker = new Docker();
    await docker.ping();
  } catch {
    throw new DockerNotAvailableError();
  }

  // 2. Pull image if not already in the local cache
  if (!(await imageExists(docker, SANDBOX_IMAGE))) {
    await pullImage(docker, SANDBOX_IMAGE);
  } else {
    logger.debug(`Using cached sandbox image: ${SANDBOX_IMAGE}`);
  }

  // 3. Build env — forward only known API key vars, never the full host env
  const env = API_KEY_ENV_VARS.filter((key) => Boolean(process.env[key])).map(
    (key) => `${key}=${process.env[key]}`,
  );

  // 4. Create the container
  //    WorkingDir is /tmp so that git clone temp dirs land on the tmpfs mount,
  //    keeping the read-only rootfs intact.
  logger.info("Launching sandbox container...");
  const container = await docker.createContainer({
    Image: SANDBOX_IMAGE,
    Cmd: ["inspect", source, ...forwardedArgs],
    Env: env,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    WorkingDir: "/tmp",
    HostConfig: {
      AutoRemove: true,
      NetworkMode: "bridge",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      // Read-only rootfs: only /tmp is writable (holds git clone temp dirs)
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=512m" },
    },
  });

  // 5. Attach to the container's stdout/stderr *before* starting it to avoid
  //    missing any early output lines.
  const stream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  // Docker non-TTY streams multiplex stdout and stderr into a single stream.
  // demuxStream splits them back out into the correct host file descriptors.
  const stdoutPass = new PassThrough();
  const stderrPass = new PassThrough();
  stdoutPass.pipe(process.stdout);
  stderrPass.pipe(process.stderr);
  docker.modem.demuxStream(stream, stdoutPass, stderrPass);

  // 6. Start the container and wait for it to finish
  await container.start();
  const { StatusCode } = await container.wait();

  stdoutPass.end();
  stderrPass.end();

  if (StatusCode !== 0) {
    process.exit(StatusCode);
  }
}
