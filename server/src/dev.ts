import { createServer } from "./server.js";

const server = createServer();
server.start().then(() => {
	console.log("Pi Fleet server running on http://127.0.0.1:8314");
});

process.on("SIGINT", async () => {
	await server.stop();
	process.exit(0);
});
