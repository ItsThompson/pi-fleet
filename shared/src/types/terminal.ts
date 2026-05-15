export interface TmuxTarget {
  session: string;
  window: string;
  pane: string;
}

export type OpenFailureReason =
  | "not-in-tmux"
  | "invalid-target"
  | "pane-not-found"
  | "no-server"
  | "no-client"
  | "multi-client"
  | "switch-failed"
  | "activation-failed";

export type OpenResult =
  | { ok: true }
  | { ok: false; reason: OpenFailureReason };
