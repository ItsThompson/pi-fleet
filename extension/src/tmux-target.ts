export interface TmuxTarget {
  session: string;
  window: string;
  pane: string;
  target: string;
}

export type Exec = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string; code: number }>;

const TARGET_RE = /^(.+):(.+)\.(.+)$/;

/**
 * Capture the current tmux target (session:window.pane).
 * Returns null if not running inside tmux or if the command fails.
 */
export async function captureTmuxTarget(
  env: NodeJS.ProcessEnv,
  exec: Exec,
): Promise<TmuxTarget | null> {
  if (!env.TMUX) return null;

  try {
    const { stdout, code } = await exec("tmux", [
      "display-message",
      "-p",
      "#S:#I.#P",
    ]);
    if (code !== 0) return null;

    const match = TARGET_RE.exec(stdout.trim());
    if (!match) return null;

    return {
      session: match[1],
      window: match[2],
      pane: match[3],
      target: `${match[1]}:${match[2]}.${match[3]}`,
    };
  } catch {
    return null;
  }
}
