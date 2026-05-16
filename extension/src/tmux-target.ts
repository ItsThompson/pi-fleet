/**
 * Read the stable tmux pane ID from the environment.
 * $TMUX_PANE is set by tmux itself (e.g., "%5") and never changes
 * for the life of the process tree.
 *
 * Returns null when not running inside tmux.
 */
export function getTmuxPaneId(env: NodeJS.ProcessEnv): string | null {
	return env.TMUX_PANE || null;
}
