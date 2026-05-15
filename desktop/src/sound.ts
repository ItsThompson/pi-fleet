import { shell } from "electron";
import type { ConfigManager } from "./config.js";

/** States that trigger attention sounds */
const ATTENTION_STATES = new Set(["pending_approval", "idle"]);

export interface SoundManager {
  /**
   * Check if a session state transition should trigger a sound.
   * Deduplicates: only fires once per session per transition (not on heartbeat repeats).
   */
  handleStateChange(sessionId: string, activity: string): void;
  dispose(): void;
}

export interface SoundManagerDeps {
  configManager: ConfigManager;
}

/**
 * Manages sound alerts for attention transitions.
 * Tracks the last attention state per session to avoid replaying
 * on heartbeat confirmations.
 */
export function createSoundManager(deps: SoundManagerDeps): SoundManager {
  const { configManager } = deps;
  /** Map of sessionId → last reported activity state */
  const lastState = new Map<string, string>();

  function handleStateChange(sessionId: string, activity: string): void {
    const config = configManager.get();
    if (!config.preferences.soundEnabled) return;

    const previousState = lastState.get(sessionId);
    lastState.set(sessionId, activity);

    // Only fire on transition INTO an attention state
    // (not when staying in the same state on repeated heartbeats)
    if (ATTENTION_STATES.has(activity) && previousState !== activity) {
      playSound();
    }
  }

  function playSound(): void {
    // shell.beep() is the simplest cross-platform alert sound
    shell.beep();
  }

  function dispose(): void {
    lastState.clear();
  }

  return {
    handleStateChange,
    dispose,
  };
}
