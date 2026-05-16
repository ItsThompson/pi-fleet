import { useDraggable } from "@dnd-kit/core";
import type { PodDragData } from "./types";
import { cn } from "@/lib/utils";

interface DraggablePodProps {
	podId: string;
	displayName: string;
	sourceClusterId: string | null;
	children: React.ReactNode;
}

export function DraggablePod({
	podId,
	displayName,
	sourceClusterId,
	children,
}: DraggablePodProps) {
	const dragData: PodDragData = {
		type: "pod",
		podId,
		displayName,
		sourceClusterId,
	};

	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `pod-${podId}`,
		data: dragData,
	});

	return (
		<div
			ref={setNodeRef}
			{...listeners}
			{...attributes}
			className={cn(isDragging && "opacity-40")}
		>
			{children}
		</div>
	);
}
