import type { Pod } from "@pi-fleet/shared";
import { SessionStatusDot } from "@/components/sessions/SessionStatusDot";
import { Badge } from "@/components/ui/badge";
import { useNavigationStore } from "@/stores/navigation-store";

interface PodRowProps {
	pod: Pod;
}

export function PodRow({ pod }: PodRowProps) {
	const navigateTo = useNavigationStore((state) => state.navigateTo);

	return (
		<button
			type="button"
			className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors text-left"
			onClick={() => navigateTo("pod", pod.leadSessionId)}
		>
			<SessionStatusDot status={pod.state} />
			<span className="truncate flex-1">{pod.displayName}</span>
			{pod.attentionCount > 0 && (
				<Badge variant="destructive" className="text-[10px] h-4 min-w-4 px-1">
					{pod.attentionCount > 9 ? "9+" : pod.attentionCount}
				</Badge>
			)}
		</button>
	);
}
