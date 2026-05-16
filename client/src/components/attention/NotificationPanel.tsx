import { useSessionStore } from "@/stores/session-store";
import { usePodStore } from "@/stores/pod-store";
import { useClusterStore } from "@/stores/cluster-store";
import { useNotificationDismissStore } from "@/stores/notification-dismiss-store";
import { deriveNotificationEntries } from "./derive-notifications";
import { filterDismissedNotifications } from "./filter-dismissed-notifications";
import { NotificationItem } from "./NotificationItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { openInTerminal } from "@/lib/bridge";

export function NotificationPanel() {
  const sessions = useSessionStore((state) => state.sessions);
  const activityChangedAt = useSessionStore((state) => state.activityChangedAt);
  const pods = usePodStore((state) => state.pods);
  const clusters = useClusterStore((state) => state.clusters);

  const dismissed = useNotificationDismissStore((state) => state.dismissed);
  const dismiss = useNotificationDismissStore((state) => state.dismiss);
  const dismissAll = useNotificationDismissStore((state) => state.dismissAll);

  const allEntries = deriveNotificationEntries(sessions, pods, activityChangedAt, clusters);
  const entries = filterDismissedNotifications(allEntries, dismissed);

  const handleDismiss = (sessionId: string) => {
    const entry = entries.find((item) => item.sessionId === sessionId);
    if (entry) {
      dismiss(sessionId, entry.stateChangedAt);
    }
  };

  const handleClearAll = () => {
    dismissAll(entries);
  };

  return (
    <div className="absolute right-0 top-full mt-1 w-80 z-50 rounded-md border bg-popover shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">
          Notifications ({entries.length})
        </h3>
        {entries.length > 0 && (
          <Button variant="ghost" size="xs" onClick={handleClearAll} className="text-xs">
            Clear all
          </Button>
        )}
      </div>
      <ScrollArea className="max-h-96">
        {entries.length > 0 ? (
          <div className="p-2 space-y-2">
            {entries.map((entry) => (
              <NotificationItem
                key={entry.sessionId}
                entry={entry}
                onOpen={openInTerminal}
                onDismiss={handleDismiss}
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
