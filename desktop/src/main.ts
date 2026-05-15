import { app } from "electron";
import { registerOpenSessionIPC } from "./ipc-open-session.js";

app.whenReady().then(() => {
  registerOpenSessionIPC();
});
