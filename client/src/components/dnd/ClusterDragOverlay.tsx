interface ClusterDragOverlayProps {
	name: string;
}

export function ClusterDragOverlay({ name }: ClusterDragOverlayProps) {
	return (
		<div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm bg-background border shadow-lg font-medium">
			{name}
		</div>
	);
}
