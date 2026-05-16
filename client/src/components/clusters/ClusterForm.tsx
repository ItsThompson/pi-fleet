import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";
import { getServerUrl } from "@/lib/bridge";
import { createCluster, editCluster } from "@/api/cluster-api";
import type { ClusterDefinition } from "@pi-fleet/shared";

interface ClusterFormProps {
	/** Existing cluster to edit; null for create mode */
	cluster?: ClusterDefinition | null;
	/** Called when form is closed (submit or cancel) */
	onClose: () => void;
}

export function ClusterForm({ cluster, onClose }: ClusterFormProps) {
	const [name, setName] = useState(cluster?.name ?? "");
	const [directories, setDirectories] = useState<string[]>(
		cluster?.directories ?? [""],
	);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isEditing = cluster !== null && cluster !== undefined;

	function addDirectory(): void {
		setDirectories([...directories, ""]);
	}

	function removeDirectory(index: number): void {
		setDirectories(directories.filter((_, i) => i !== index));
	}

	function updateDirectory(index: number, value: string): void {
		const updated = [...directories];
		updated[index] = value;
		setDirectories(updated);
	}

	async function handleSubmit(event: React.FormEvent): Promise<void> {
		event.preventDefault();
		if (!name.trim()) {
			return;
		}

		setSubmitting(true);
		setError(null);

		const baseUrl = getServerUrl();
		const cleanDirectories = directories.filter((d) => d.trim().length > 0);

		const result = isEditing
			? await editCluster(baseUrl, cluster.id, {
					name: name.trim(),
					directories: cleanDirectories,
				})
			: await createCluster(baseUrl, {
					name: name.trim(),
					directories: cleanDirectories,
				});

		setSubmitting(false);

		if (!result.ok) {
			const messages: Record<string, string> = {
				network: "Network error. Check your connection.",
				validation: "Invalid cluster data. Check your inputs.",
				"not-found": "Cluster not found. It may have been deleted.",
				"server-error": "Server error. Please try again.",
			};
			setError(messages[result.error] ?? "An unexpected error occurred.");
			return;
		}

		onClose();
	}

	function getSubmitLabel(): string {
		if (submitting) {
			return "Saving...";
		}
		return isEditing ? "Save Changes" : "Create";
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 border">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold">
						{isEditing ? "Edit Cluster" : "Create Cluster"}
					</h2>
					<Button variant="ghost" size="icon" onClick={onClose}>
						<X className="h-4 w-4" />
					</Button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
							{error}
						</div>
					)}

					<div>
						<label
							htmlFor="cluster-name"
							className="block text-sm font-medium mb-1"
						>
							Name
						</label>
						<input
							id="cluster-name"
							type="text"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g., Work, Personal"
							className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
							autoFocus
							required
						/>
					</div>

					<div>
						<div className="flex items-center justify-between mb-1">
							<label className="block text-sm font-medium">Directories</label>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={addDirectory}
							>
								<Plus className="h-3 w-3 mr-1" />
								Add
							</Button>
						</div>
						<p className="text-xs text-muted-foreground mb-2">
							Sessions with matching working directories will auto-assign to
							this cluster. Use ~ for home directory.
						</p>
						<div className="space-y-2">
							{directories.map((dir, index) => (
								<div key={index} className="flex items-center gap-2">
									<input
										type="text"
										value={dir}
										onChange={(event) =>
											updateDirectory(index, event.target.value)
										}
										placeholder="~/workplace/project/"
										className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									/>
									<Button
										type="button"
										variant="ghost"
										size="xs"
										onClick={() => removeDirectory(index)}
										disabled={directories.length <= 1}
									>
										<X className="h-3 w-3" />
									</Button>
								</div>
							))}
						</div>
					</div>

					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={!name.trim() || submitting}>
							{getSubmitLabel()}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
