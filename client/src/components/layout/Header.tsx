import type { SSEConnectionState } from "@/hooks/useSSE";
import { useHealth } from "@/hooks/useHealth";
import { useSessionStore } from "@/stores/session-store";
import { useNotificationDismissStore } from "@/stores/notification-dismiss-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { NotificationPanel } from "@/components/attention/NotificationPanel";
import { AttentionBadge } from "@/components/attention/AttentionBadge";
import { Bell, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useState, useRef, useEffect, type CSSProperties } from "react";

interface HeaderProps {
	connectionState: SSEConnectionState;
}

export function computeVisibleAttentionCount(
	sessions: Map<string, { activity: string }>,
	activityChangedAt: Map<string, string>,
	dismissed: Map<string, { dismissedStateChangedAt: string }>,
): number {
	return Array.from(sessions.entries()).reduce(
		(count, [sessionId, session]) => {
			if (
				session.activity !== "pending_approval" &&
				session.activity !== "idle"
			)
				return count;
			const stateChangedAt = activityChangedAt.get(sessionId) ?? "";
			const record = dismissed.get(sessionId);
			const isCurrentlyDismissed =
				record != null && stateChangedAt <= record.dismissedStateChangedAt;
			return isCurrentlyDismissed ? count : count + 1;
		},
		0,
	);
}

export function Header({ connectionState }: HeaderProps) {
	const [panelOpen, setPanelOpen] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const sessions = useSessionStore((state) => state.sessions);
	const activityChangedAt = useSessionStore((state) => state.activityChangedAt);
	const dismissed = useNotificationDismissStore((state) => state.dismissed);
	const totalAttention = computeVisibleAttentionCount(
		sessions,
		activityChangedAt,
		dismissed,
	);

	// Close panel on outside click
	useEffect(() => {
		if (!panelOpen) return;

		function handleClickOutside(event: MouseEvent) {
			if (
				panelRef.current &&
				!panelRef.current.contains(event.target as Node)
			) {
				setPanelOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [panelOpen]);

	return (
		<header
			className="border-b px-4 py-2 shrink-0"
			style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
		>
			<div className="flex items-center justify-between">
				<h1
					className="text-sm font-semibold cursor-pointer hover:text-foreground/80 transition-colors"
					style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
					onClick={() => useNavigationStore.getState().navigateTo("cluster")}
				>
					Pi Fleet
				</h1>
				<div
					className="flex items-center gap-2"
					style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
				>
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
						{panelOpen && <NotificationPanel />}
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
					Reconnecting
					{connectionState.attemptCount > 0 &&
						` (attempt ${connectionState.attemptCount})`}
					...
				</div>
			)}
			<PiWatchNotice />
		</header>
	);
}

/**
 * Non-blocking notice shown when pi-watch extension is detected.
 * Suggests removal to avoid duplicate registrations.
 */
function PiWatchNotice() {
	const health = useHealth();
	const [dismissed, setDismissed] = useState(false);

	if (dismissed || !health?.piWatchDetected) return null;

	return (
		<div className="mt-1 rounded bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 text-xs text-orange-300 flex items-start gap-2">
			<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
			<div className="flex-1">
				<span className="font-medium">pi-watch extension detected.</span>{" "}
				Consider removing it to avoid duplicate session registrations:{" "}
				<code className="bg-secondary px-1 py-0.5 rounded text-[10px]">
					rm ~/.pi/agent/extensions/pi-watch
				</code>
			</div>
			<button
				type="button"
				onClick={() => setDismissed(true)}
				className="text-orange-400 hover:text-orange-200 shrink-0"
				aria-label="Dismiss pi-watch notice"
			>
				×
			</button>
		</div>
	);
}
