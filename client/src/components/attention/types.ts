export interface NotificationEntry {
	sessionId: string;
	sessionName: string;
	podDisplayName: string;
	clusterName: string | null;
	state: "pending_approval" | "idle";
	stateChangedAt: string;
}
