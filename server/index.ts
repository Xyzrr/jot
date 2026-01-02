import { Hono } from "hono";
import { api } from "./api/routes";
import { config } from "./config";
import { ensureMessagesTable } from "./db/client";

const app = new Hono();

// API routes
app.route("/api", api);

// Ensure protected tables exist on startup
ensureMessagesTable()
  .then(() => console.log("✓ messages table ready"))
  .catch((err) => console.error("✗ failed to init messages table:", err));

console.log(`
🚀 Jot API running on port ${config.port}
   API: http://localhost:${config.port}/api
`);

export default {
  port: config.port,
  fetch: app.fetch,
};
