import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { deriveNotificationEntries } from "./derive-notifications";
import { NotificationItem } from "./NotificationItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationPanelProps {
  onClose: () => void;
}

function handleOpenInTerminal(sessionId: string): void {
  const bridge = (window as unknown as { piFleet?: { openSession: (id: string) => void } }).piFleet;
  if (bridge) {
    bridge.openSession(sessionId);
  }
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const sessions = useSessionStore((state) => state.sessions);
  const activityChangedAt = useSessionStore((state) => state.activityChangedAt);
  const pods = usePodStore((state) => state.pods);
  const clusters = useClusterStore((state) => state.clusters);

  const entries = deriveNotificationEntries(sessions, pods, activityChangedAt, clusters);

  return (
    <div className="absolute right-0 top-full mt-1 w-80 z-50 rounded-md border bg-popover shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">
          Notifications ({entries.length})
        </h3>
        <Button variant="ghost" size="xs" onClick={onClose} aria-label="Close notifications">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="max-h-96">
        {entries.length > 0 ? (
          <div className="p-2 space-y-2">
            {entries.map((entry) => (
              <NotificationItem
                key={entry.sessionId}
                entry={entry}
                onOpen={handleOpenInTerminal}
              />
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No sessions need attention
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
