import type { SSEConnectionState } from "@/hooks/useSSE";
import { useSessionStore } from "@/stores/session-store";
import { NotificationPanel } from "@/components/attention/NotificationPanel";
import { AttentionBadge } from "@/components/attention/AttentionBadge";
import { Bell, Wifi, WifiOff } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface HeaderProps {
  connectionState: SSEConnectionState;
}

function computeTotalAttention(sessions: Map<string, { activity: string }>): number {
  let count = 0;
  sessions.forEach((session) => {
    if (session.activity === "pending_approval" || session.activity === "idle") {
      count += 1;
    }
  });
  return count;
}

export function Header({ connectionState }: HeaderProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sessions = useSessionStore((state) => state.sessions);
  const totalAttention = computeTotalAttention(sessions);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [panelOpen]);

  return (
    <header className="border-b px-4 py-2 shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Pi Fleet</h1>
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <div className="relative" ref={panelRef}>
            <button
              type="button"
              onClick={() => setPanelOpen((prev) => !prev)}
              className="relative p-1 rounded-md hover:bg-accent/50 transition-colors"
              aria-label="Notifications"
              aria-expanded={panelOpen}
            >
              <Bell className="h-4 w-4" />
              {totalAttention > 0 && (
                <span className="absolute -top-0.5 -right-0.5">
                  <AttentionBadge
                    count={totalAttention}
                    className="text-[9px] h-3.5 min-w-3.5 px-1"
                  />
                </span>
              )}
            </button>
            {panelOpen && (
              <NotificationPanel onClose={() => setPanelOpen(false)} />
            )}
          </div>
          {/* Connection status */}
          {connectionState.connected ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-500" />
          )}
        </div>
      </div>
      {connectionState.reconnecting && (
        <div className="mt-1 rounded bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 text-xs text-yellow-400">
          Reconnecting{connectionState.attemptCount > 0 && ` (attempt ${connectionState.attemptCount})`}...
        </div>
      )}
    </header>
  );
}
