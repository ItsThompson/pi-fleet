import type { ActivityStatus, RegisteredSession } from "@pi-fleet/shared";
import { useFilterStore } from "@/stores/filter-store";
import { cn } from "@/lib/utils";

interface FilterBadgesProps {
  /** Sessions visible in the current view (for count computation) */
  sessions: RegisteredSession[];
}

interface FilterBadgeConfig {
  status: ActivityStatus;
  label: string;
  activeColor: string;
  dotColor: string;
}

const FILTER_CONFIGS: FilterBadgeConfig[] = [
  {
    status: "pending_approval",
    label: "Pending Approval",
    activeColor: "bg-red-500/20 border-red-500 text-red-400",
    dotColor: "bg-red-500",
  },
  {
    status: "idle",
    label: "Idle",
    activeColor: "bg-yellow-500/20 border-yellow-500 text-yellow-400",
    dotColor: "bg-yellow-500",
  },
  {
    status: "running_tool",
    label: "Running Tool",
    activeColor: "bg-green-500/20 border-green-500 text-green-400",
    dotColor: "bg-green-500",
  },
  {
    status: "processing",
    label: "Processing",
    activeColor: "bg-blue-500/20 border-blue-500 text-blue-400",
    dotColor: "bg-blue-500",
  },
];

export function FilterBadges({ sessions }: FilterBadgesProps) {
  const activeFilters = useFilterStore((state) => state.activeFilters);
  const toggleFilter = useFilterStore((state) => state.toggleFilter);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="State filters">
      {FILTER_CONFIGS.map((config) => {
        const count = sessions.filter((s) => s.activity === config.status).length;
        if (count === 0) return null;

        const isActive = activeFilters.has(config.status);

        return (
          <button
            key={config.status}
            type="button"
            onClick={() => toggleFilter(config.status)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? config.activeColor
                : "border-border text-muted-foreground hover:border-muted-foreground/50",
            )}
            aria-pressed={isActive}
            aria-label={`Filter ${config.label}: ${count}`}
          >
            <span
              className={cn("inline-block h-2 w-2 rounded-full", config.dotColor)}
              aria-hidden="true"
            />
            {config.label} ({count})
          </button>
        );
      })}
    </div>
  );
}
