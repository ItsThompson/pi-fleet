import type { Pod } from "@pi-fleet/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionStatusDot } from "@/components/sessions/SessionStatusDot";
import { ExternalLink, Users } from "lucide-react";
import { useNavigationStore } from "@/stores/navigation-store";

interface PodCardProps {
  pod: Pod;
}

function handleOpenInTerminal(sessionId: string): void {
  const bridge = (window as unknown as { piFleet?: { openSession: (id: string) => void } }).piFleet;
  if (bridge) {
    bridge.openSession(sessionId);
  }
}

export function PodCard({ pod }: PodCardProps) {
  const navigateTo = useNavigationStore((state) => state.navigateTo);

  return (
    <Card
      className="w-full cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => navigateTo("pod", pod.leadSessionId)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SessionStatusDot status={pod.state} />
            <CardTitle className="truncate">{pod.displayName}</CardTitle>
            {pod.memberSessionIds.length > 1 && (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <Users className="h-3 w-3" />
                {pod.memberSessionIds.length}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              handleOpenInTerminal(pod.leadSessionId);
            }}
            title="Open in terminal"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      {pod.attentionCount > 0 && (
        <CardContent>
          <Badge variant="destructive" className="text-[10px]">
            {pod.attentionCount > 9 ? "9+" : pod.attentionCount} needs attention
          </Badge>
        </CardContent>
      )}
    </Card>
  );
}
