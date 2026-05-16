import type { SSEEvent } from "@pi-fleet/shared";

export type SSEClient = {
	id: string;
	send: (event: SSEEvent) => void;
	close: () => void;
};

/**
 * Fan-out event distribution to connected SSE clients.
 * Thin adapter: receives typed events, broadcasts to all connected clients.
 */
export class EventBus {
	private clients = new Map<string, SSEClient>();

	addClient(client: SSEClient): void {
		this.clients.set(client.id, client);
	}

	removeClient(clientId: string): void {
		this.clients.delete(clientId);
	}

	get clientCount(): number {
		return this.clients.size;
	}

	broadcast(event: SSEEvent): void {
		this.clients.forEach((client) => {
			try {
				client.send(event);
			} catch {
				// Client disconnected: remove on next cleanup
				this.clients.delete(client.id);
			}
		});
	}
}
