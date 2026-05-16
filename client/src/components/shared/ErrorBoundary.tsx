import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ErrorBoundaryProps {
	/** Child components to protect */
	children: ReactNode;
	/** Identifies which boundary caught the error (for logging) */
	level?: string;
	/** Custom fallback UI. Receives error + retry function. */
	fallback?: (props: { error: Error; retry: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
	error: Error | null;
}

/**
 * React class component that catches render errors in its subtree.
 * Shows a fallback UI with retry capability.
 * Logs errors to console.error with boundary level context.
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error(
			`[ErrorBoundary:${this.props.level ?? "unknown"}]`,
			error,
			errorInfo.componentStack,
		);
	}

	retry = (): void => {
		this.setState({ error: null });
	};

	render(): ReactNode {
		if (this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback({
					error: this.state.error,
					retry: this.retry,
				});
			}
			return <DefaultFallback error={this.state.error} retry={this.retry} />;
		}
		return this.props.children;
	}
}

interface DefaultFallbackProps {
	error: Error;
	retry: () => void;
}

function DefaultFallback({ error, retry }: DefaultFallbackProps) {
	const isDev = import.meta.env.DEV;

	return (
		<div className="flex flex-col items-center justify-center h-full p-8 text-center">
			<div className="text-destructive mb-4">
				<AlertTriangle className="h-8 w-8 mx-auto" />
			</div>
			<h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
			<p className="text-sm text-muted-foreground mb-4 max-w-md">
				An error occurred while rendering this section. Click retry to attempt
				recovery.
			</p>
			{isDev && (
				<pre className="text-xs text-left bg-secondary p-3 rounded mb-4 max-w-md overflow-auto">
					{error.message}
				</pre>
			)}
			<Button onClick={retry} variant="outline" size="sm">
				Retry
			</Button>
		</div>
	);
}
