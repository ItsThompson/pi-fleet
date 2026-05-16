import { Layers } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h2 className="text-lg font-semibold mb-2">No active sessions</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Sessions will appear here when pi is running with the pi-fleet extension installed.
        Start a pi session in your terminal to get started.
      </p>
      <div className="mt-6 bg-secondary/50 border rounded-lg p-4 max-w-md text-left">
        <p className="text-xs font-medium text-muted-foreground mb-2">Quick Setup</p>
        <p className="text-xs text-muted-foreground mb-2">
          Install the pi-fleet extension by creating a symlink:
        </p>
        <code className="block bg-background px-3 py-2 rounded text-[11px] font-mono text-foreground/80 break-all">
          ln -s /path/to/pi-fleet/extension ~/.pi/agent/extensions/pi-fleet
        </code>
        <p className="text-[10px] text-muted-foreground/70 mt-2">
          New pi sessions will automatically register after installation. No restart required.
        </p>
      </div>
    </div>
  );
}
