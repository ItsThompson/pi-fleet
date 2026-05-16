import type { NotificationEntry } from "./types";
import { SessionStatusDot } from "@/components/sessions/SessionStatusDot";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";

interface NotificationItemProps {
	entry: NotificationEntry;
	onOpen: (sessionId: string) => void;
	onDismiss: (sessionId: string) => void;
}

const STATE_LABELS: Record<"pending_approval" | "idle", string> = {
	pending_approval: "Waiting for approval",
	idle: "Idle",
};

export function NotificationItem({
	entry,
	onOpen,
	onDismiss,
}: NotificationItemProps) {
	return (
		<div className="rounded-md border p-3 space-y-1">
			<div className="flex items-center gap-2">
				<SessionStatusDot status={entry.state} />
				<span className="text-sm font-medium truncate flex-1">
					{entry.sessionName}
				</span>
				<Button
					variant="ghost"
					size="xs"
					className="h-5 w-5 p-0 shrink-0"
					onClick={() => onDismiss(entry.sessionId)}
					aria-label="Dismiss notification"
				>
					<X className="h-3 w-3" />
				</Button>
			</div>
			<p className="text-xs text-muted-foreground pl-[18px]">
				Pod: {entry.podDisplayName}
				{entry.clusterName && ` · Cluster: ${entry.clusterName}`}
			</p>
			<div className="flex items-center justify-between pl-[18px]">
				<span className="text-xs text-muted-foreground">
					{STATE_LABELS[entry.state]} ·{" "}
					{formatRelativeTime(entry.stateChangedAt)}
				</span>
				<Button
					variant="ghost"
					size="xs"
					className="gap-1 text-xs"
					onClick={() => onOpen(entry.sessionId)}
				>
					Open
					<ExternalLink className="h-3 w-3" />
				</Button>
			</div>
		</div>
	);
}
