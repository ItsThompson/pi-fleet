import type { Pod, RegisteredSession } from "@pi-fleet/shared";
import { useSessionStore } from "@/stores/session-store";
import { useFilteredSessions } from "@/hooks/useFilteredPodGrid";
import { PodGrid } from "@/components/shared/PodGrid";
import { SessionCard } from "@/components/sessions/SessionCard";
import { FilterBadges } from "@/components/attention/FilterBadges";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PodViewProps {
	pod: Pod;
}

export function PodView({ pod }: PodViewProps) {
	const sessions = useSessionStore((state) => state.sessions);

	const memberSessions = pod.memberSessionIds.reduce<RegisteredSession[]>(
		(acc, id) => {
			const session = sessions.get(id);
			if (session) acc.push(session);
			return acc;
		},
		[],
	);

	const grid = useFilteredSessions(memberSessions);
	const isMultiMember = pod.memberSessionIds.length > 1;

	return (
		<ScrollArea className="h-full p-4">
			<h2 className="text-lg font-semibold mb-2">{pod.displayName}</h2>

			<div className="mb-4">
				<FilterBadges sessions={memberSessions} />
			</div>

			<PodGrid
				sections={[
					{
						title: `Needs Attention (${grid.attentionItems.length})`,
						items: grid.attentionItems,
						renderItem: (session) => (
							<SessionCard
								key={session.sessionId}
								session={session}
								isSubagent={
									isMultiMember && session.sessionId !== pod.leadSessionId
								}
								isLead={
									isMultiMember && session.sessionId === pod.leadSessionId
								}
							/>
						),
					},
					{
						title: `Working (${grid.workingItems.length})`,
						items: grid.workingItems,
						renderItem: (session) => (
							<SessionCard
								key={session.sessionId}
								session={session}
								isSubagent={
									isMultiMember && session.sessionId !== pod.leadSessionId
								}
								isLead={
									isMultiMember && session.sessionId === pod.leadSessionId
								}
							/>
						),
					},
				]}
				hasActiveFilters={grid.filteredCount < grid.totalCount}
				totalCount={grid.totalCount}
				filteredEmptyMessage="No sessions match the active filters."
				emptyMessage="No sessions in this pod."
			/>
		</ScrollArea>
	);
}
