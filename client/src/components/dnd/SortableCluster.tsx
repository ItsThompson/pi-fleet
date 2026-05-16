import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ClusterDragData } from "./types";
import { cn } from "@/lib/utils";

interface SortableClusterProps {
	clusterId: string;
	name: string;
	children: React.ReactNode;
}

export function SortableCluster({
	clusterId,
	name,
	children,
}: SortableClusterProps) {
	const dragData: ClusterDragData = {
		type: "cluster",
		clusterId,
		name,
	};

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: `cluster-sort-${clusterId}`,
		data: dragData,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={cn(isDragging && "opacity-40 z-50")}
		>
			{children}
		</div>
	);
}
