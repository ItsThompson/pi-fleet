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
    activeColor: "bg-activity-pending-approval/20 border-activity-pending-approval text-activity-pending-approval",
    dotColor: "bg-activity-pending-approval",
  },
  {
    status: "idle",
    label: "Idle",
    activeColor: "bg-activity-idle/20 border-activity-idle text-activity-idle",
    dotColor: "bg-activity-idle",
  },
  {
    status: "running_tool",
    label: "Running Tool",
    activeColor: "bg-activity-running-tool/20 border-activity-running-tool text-activity-running-tool",
    dotColor: "bg-activity-running-tool",
  },
  {
    status: "processing",
    label: "Processing",
    activeColor: "bg-activity-processing/20 border-activity-processing text-activity-processing",
    dotColor: "bg-activity-processing",
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
