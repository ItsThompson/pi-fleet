import type { ReactNode } from "react";

export interface PodGridSection<T> {
	/** Section heading (e.g., "Needs Attention (3)") */
	title: string;
	/** Items to render in this section */
	items: T[];
	/** Render function for each item */
	renderItem: (item: T) => ReactNode;
}

export interface PodGridProps<T> {
	/** Sections to render (typically attention + working) */
	sections: PodGridSection<T>[];
	/** Message when filtering removes all items */
	filteredEmptyMessage?: string;
	/** Message when there are no items at all */
	emptyMessage?: string;
	/** Whether filters are hiding some items */
	hasActiveFilters: boolean;
	/** Total items before filtering */
	totalCount: number;
}

const GRID_CLASSES = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3";

/**
 * Presentational component rendering sections of cards in a responsive grid.
 * Does not access any stores. Pure props-driven rendering.
 */
export function PodGrid<T>({
	sections,
	filteredEmptyMessage = "No items match the active filters.",
	emptyMessage = "No items to display.",
	hasActiveFilters,
	totalCount,
}: PodGridProps<T>): ReactNode {
	const visibleSections = sections.filter(
		(section) => section.items.length > 0,
	);
	const totalVisible = sections.reduce(
		(sum, section) => sum + section.items.length,
		0,
	);

	// Total empty: no items exist at all
	if (totalCount === 0) {
		return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
	}

	// Filtered empty: items exist but all filtered out
	if (totalVisible === 0 && hasActiveFilters) {
		return (
			<p className="text-sm text-muted-foreground">{filteredEmptyMessage}</p>
		);
	}

	return (
		<>
			{visibleSections.map((section) => (
				<section key={section.title} className="mb-6">
					<h3 className="text-sm font-medium text-muted-foreground mb-3">
						{section.title}
					</h3>
					<div className={GRID_CLASSES}>
						{section.items.map((item) => section.renderItem(item))}
					</div>
				</section>
			))}
		</>
	);
}
