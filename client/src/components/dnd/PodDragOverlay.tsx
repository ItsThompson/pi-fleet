import { SessionStatusDot } from "@/components/sessions/SessionStatusDot";
import type { Pod } from "@pi-fleet/shared";

interface PodDragOverlayProps {
  pod: Pod;
}

export function PodDragOverlay({ pod }: PodDragOverlayProps) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm bg-background border shadow-lg">
      <SessionStatusDot status={pod.state} />
      <span className="truncate">{pod.displayName}</span>
    </div>
  );
}
