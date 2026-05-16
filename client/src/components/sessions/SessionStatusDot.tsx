import type { ActivityStatus } from "@pi-fleet/shared";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<ActivityStatus, string> = {
	idle: "bg-activity-idle",
	processing: "bg-activity-processing",
	running_tool: "bg-activity-running-tool",
	pending_approval: "bg-activity-pending-approval",
};

const STATUS_LABELS: Record<ActivityStatus, string> = {
	processing: "Processing",
	running_tool: "Running tool",
	idle: "Idle",
	pending_approval: "Needs approval",
};

interface SessionStatusDotProps {
	status: ActivityStatus;
	className?: string;
}

export function SessionStatusDot({ status, className }: SessionStatusDotProps) {
	return (
		<span
			className={cn(
				"inline-block h-2.5 w-2.5 rounded-full",
				STATUS_COLORS[status],
				className,
			)}
			title={STATUS_LABELS[status]}
			aria-label={STATUS_LABELS[status]}
		/>
	);
}
