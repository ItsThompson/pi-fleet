import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen, Users, Pencil, Trash2 } from "lucide-react";
import type { DerivedCluster } from "@/lib/derived-clusters";

interface ClusterHeaderProps {
	cluster: DerivedCluster;
	manualCount: number;
	onEdit: () => void;
	onDelete: () => void;
}

export function ClusterHeader({
	cluster,
	manualCount,
	onEdit,
	onDelete,
}: ClusterHeaderProps) {
	return (
		<div className="flex items-start justify-between mb-4">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold">{cluster.definition.name}</h2>
					{cluster.attentionCount > 0 && (
						<Badge variant="destructive" className="text-xs">
							{cluster.attentionCount} needs attention
						</Badge>
					)}
				</div>

				{cluster.definition.directories.length > 0 && (
					<div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
						<FolderOpen className="h-3.5 w-3.5 shrink-0" />
						<span className="truncate">
							{cluster.definition.directories.join(", ")}
						</span>
					</div>
				)}

				{manualCount > 0 && (
					<div className="flex items-center gap-1 mt-0.5 text-sm text-muted-foreground">
						<Users className="h-3.5 w-3.5 shrink-0" />
						<span>
							{manualCount} manual assignment{manualCount !== 1 ? "s" : ""}
						</span>
					</div>
				)}
			</div>

			<div className="flex items-center gap-1 shrink-0">
				<Button
					variant="ghost"
					size="icon"
					onClick={onEdit}
					title="Edit cluster"
				>
					<Pencil className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onDelete}
					title="Delete cluster"
				>
					<Trash2 className="h-4 w-4 text-destructive" />
				</Button>
			</div>
		</div>
	);
}
