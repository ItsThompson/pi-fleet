import type { ActivityStatus, RegisteredSession } from "@pi-fleet/shared";
import { useFilterStore } from "@/stores/filter-store";
import { cn } from "@/lib/utils";

interface FilterBadgesProps {
  /** Sessions visible in the current view (for count computation) */
  sessions: RegisteredSession[];
}

interface FilterBadgeConfig {
  /** The status used to trigger toggleFilter */
  triggerStatus: ActivityStatus;
  /** All statuses this badge represents */
  statuses: ActivityStatus[];
  label: string;
  activeColor: string;
  dotColor: string;
}

const FILTER_CONFIGS: FilterBadgeConfig[] = [
  {
    triggerStatus: "pending_approval",
    statuses: ["pending_approval"],
    label: "Needs Approval",
    activeColor: "bg-red-500/20 border-red-500 text-red-400",
    dotColor: "bg-red-500",
  },
  {
    triggerStatus: "idle",
    statuses: ["idle"],
    label: "Idle",
    activeColor: "bg-yellow-500/20 border-yellow-500 text-yellow-400",
    dotColor: "bg-yellow-500",
  },
  {
    triggerStatus: "processing",
    statuses: ["processing", "running_tool"],
    label: "Working",
    activeColor: "bg-green-500/20 border-green-500 text-green-400",
    dotColor: "bg-green-500",
  },
];

function computeGroupCount(sessions: RegisteredSession[], statuses: ActivityStatus[]): number {
  const statusSet = new Set(statuses);
  return sessions.filter((session) => statusSet.has(session.activity)).length;
}

export function FilterBadges({ sessions }: FilterBadgesProps) {
  const activeFilters = useFilterStore((state) => state.activeFilters);
  const toggleFilter = useFilterStore((state) => state.toggleFilter);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="State filters">
      {FILTER_CONFIGS.map((config) => {
        const count = computeGroupCount(sessions, config.statuses);
        if (count === 0) return null;

        // Active if any of the group's statuses are in activeFilters
        const isActive = config.statuses.some((s) => activeFilters.has(s));

        return (
          <button
            key={config.triggerStatus}
            type="button"
            onClick={() => toggleFilter(config.triggerStatus)}
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
