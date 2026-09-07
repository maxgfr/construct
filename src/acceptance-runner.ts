import { spawnSync } from "node:child_process";
import type { CommandObservation } from "./acceptance.js";
import { VERIFY_COMMAND_TIMEOUT_MS } from "./config.js";

/** Same opt-in shell contract as verify.commands, retaining native failure metadata. */
export function runAcceptanceCommand(command: string, cwd: string, timeoutMs = VERIFY_COMMAND_TIMEOUT_MS): CommandObservation {
  const windows = process.platform === "win32";
  const cap = 65_536;
  // Node's synchronous implementation honors detached; its TS options omit it.
  // Keep the structural options object explicit, covered by process-group tests.
  const options = {
    cwd,
    timeout: timeoutMs,
    encoding: "utf8" as const,
    maxBuffer: cap,
    killSignal: "SIGKILL" as const,
    detached: !windows,
  };
  const r = spawnSync(windows ? "cmd" : "sh", windows ? ["/c", command] : ["-c", command], options);
  let cleanupError: string | undefined;
  if (!windows && r.pid) {
    // Only this command's new process group, never an arbitrary PID search.
    try {
      process.kill(-r.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") cleanupError = (error as Error).message;
    }
  }
  const error = r.error as NodeJS.ErrnoException | undefined;
  const stdout = r.stdout ?? "",
    stderr = r.stderr ?? "";
  return {
    command,
    ok: r.status === 0 && !r.signal && !error && !cleanupError,
    exitCode: r.status,
    stdout: stdout.slice(0, cap),
    stderr: stderr.slice(0, cap),
    signal: r.signal,
    timedOut: error?.code === "ETIMEDOUT",
    ...(error || cleanupError ? { error: (error?.message ?? cleanupError!).slice(0, 1000) } : {}),
    outputTruncated: error?.code === "ENOBUFS" || Buffer.byteLength(stdout) > cap || Buffer.byteLength(stderr) > cap,
  };
}
