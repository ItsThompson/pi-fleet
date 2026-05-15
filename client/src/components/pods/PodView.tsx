import type { Pod, RegisteredSession, ActivityStatus } from "@pi-fleet/shared";
import { useSessionStore } from "@/stores/session-store";
import { SessionCard } from "@/components/sessions/SessionCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PodViewProps {
  pod: Pod;
}

function needsAttention(activity: ActivityStatus): boolean {
  return activity === "pending_approval" || activity === "idle";
}

export function PodView({ pod }: PodViewProps) {
  const sessions = useSessionStore((state) => state.sessions);

  const memberSessions = pod.memberSessionIds.reduce<RegisteredSession[]>((acc, id) => {
    const session = sessions.get(id);
    if (session) acc.push(session);
    return acc;
  }, []);

  const attentionSessions = memberSessions.filter((session) => needsAttention(session.activity));
  const workingSessions = memberSessions.filter((session) => !needsAttention(session.activity));

  const isMultiMember = pod.memberSessionIds.length > 1;

  return (
    <ScrollArea className="h-full p-4">
      <h2 className="text-lg font-semibold mb-4">{pod.displayName}</h2>

      {attentionSessions.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Needs Attention ({attentionSessions.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {attentionSessions.map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                isSubagent={isMultiMember && session.sessionId !== pod.leadSessionId}
                isLead={isMultiMember && session.sessionId === pod.leadSessionId}
              />
            ))}
          </div>
        </section>
      )}

      {workingSessions.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Working ({workingSessions.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workingSessions.map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                isSubagent={isMultiMember && session.sessionId !== pod.leadSessionId}
                isLead={isMultiMember && session.sessionId === pod.leadSessionId}
              />
            ))}
          </div>
        </section>
      )}

      {memberSessions.length === 0 && (
        <p className="text-sm text-muted-foreground">No sessions in this pod.</p>
      )}
    </ScrollArea>
  );
}
