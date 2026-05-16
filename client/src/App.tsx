import { useSSE } from "@/hooks/useSSE";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainArea } from "@/components/layout/MainArea";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export function App() {
	const connectionState = useSSE();

	return (
		<ErrorBoundary level="app">
			<div className="flex flex-col h-screen bg-background text-foreground">
				<Header connectionState={connectionState} />
				<div className="flex flex-1 overflow-hidden">
					<ErrorBoundary level="sidebar">
						<Sidebar />
					</ErrorBoundary>
					<main className="flex-1 overflow-hidden">
						<ErrorBoundary level="content">
							<MainArea />
						</ErrorBoundary>
					</main>
				</div>
			</div>
		</ErrorBoundary>
	);
}
