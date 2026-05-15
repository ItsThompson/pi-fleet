import type { SSEConnectionState } from "@/hooks/useSSE";
import { Wifi, WifiOff } from "lucide-react";

interface HeaderProps {
  connectionState: SSEConnectionState;
}

export function Header({ connectionState }: HeaderProps) {
  return (
    <header className="border-b px-4 py-2 shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Pi Fleet</h1>
        <div className="flex items-center gap-2">
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
