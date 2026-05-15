import type { RegisteredSession } from "@pi-fleet/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SessionStatusDot } from "./SessionStatusDot";
import { ExternalLink } from "lucide-react";

interface SessionCardProps {
  session: RegisteredSession;
  isSubagent?: boolean;
  isLead?: boolean;
}

function getSessionDisplayName(session: RegisteredSession): string {
  return session.agentName ?? session.cwd.split("/").pop() ?? session.sessionId.slice(0, 8);
}

function handleOpenInTerminal(sessionId: string): void {
  const bridge = (window as unknown as { piFleet?: { openSession: (id: string) => void } }).piFleet;
  if (bridge) {
    bridge.openSession(sessionId);
  }
}

export function SessionCard({ session, isSubagent, isLead }: SessionCardProps) {
  const displayName = getSessionDisplayName(session);
  const contextPercent = session.contextUsage?.percent ?? null;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SessionStatusDot status={session.activity} />
            <CardTitle className="truncate">{displayName}</CardTitle>
            {isSubagent && (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                sub
              </Badge>
            )}
            {isLead && (
              <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                lead
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleOpenInTerminal(session.sessionId)}
            title="Open in terminal"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-xs text-muted-foreground">
          {session.model && (
            <div className="flex justify-between">
              <span>Model</span>
              <span className="text-foreground font-medium">{session.model}</span>
            </div>
          )}
          {contextPercent !== null && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Context</span>
                <span className="text-foreground font-medium">{contextPercent}%</span>
              </div>
              <Progress value={contextPercent} />
            </div>
          )}
          {session.turnCount !== undefined && (
            <div className="flex justify-between">
              <span>Turns</span>
              <span className="text-foreground font-medium">{session.turnCount}</span>
            </div>
          )}
          {session.thinkingLevel && session.thinkingLevel !== "off" && (
            <div className="flex justify-between">
              <span>Thinking</span>
              <span className="text-foreground font-medium capitalize">{session.thinkingLevel}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
