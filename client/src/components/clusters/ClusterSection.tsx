import type { Pod } from "@pi-fleet/shared";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { PodRow } from "@/components/pods/PodRow";
import { DraggablePod } from "@/components/dnd";
import { useNavigationStore } from "@/stores/navigation-store";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ClusterSectionProps {
  name: string;
  clusterId: string | null;
  pods: Pod[];
  attentionCount: number;
}

export function ClusterSection({ name, clusterId, pods, attentionCount }: ClusterSectionProps) {
  const [open, setOpen] = useState(true);
  const navigateTo = useNavigationStore((state) => state.navigateTo);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
      <div className="flex items-center">
        <CollapsibleTrigger className="flex-1 flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors">
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          <span
            className="text-sm font-medium truncate cursor-pointer"
            onClick={(event) => {
              event.stopPropagation();
              if (clusterId) {
                navigateTo("cluster", clusterId);
              }
            }}
          >
            {name}
          </span>
          {attentionCount > 0 && (
            <Badge variant="destructive" className="ml-auto text-[10px] h-4 min-w-4 px-1">
              {attentionCount > 9 ? "9+" : attentionCount}
            </Badge>
          )}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="pl-4 mt-0.5">
        {pods.map((pod) => (
          <DraggablePod
            key={pod.leadSessionId}
            podId={pod.leadSessionId}
            displayName={pod.displayName}
            sourceClusterId={clusterId}
          >
            <PodRow pod={pod} />
          </DraggablePod>
        ))}
        {pods.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-1">No pods</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
