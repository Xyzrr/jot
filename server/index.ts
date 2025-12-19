import { Hono } from "hono";
import { api } from "./api/routes";
import { config } from "./config";

const app = new Hono();

// API routes
app.route("/api", api);

console.log(`
🚀 Jot API running on port ${config.port}
   API: http://localhost:${config.port}/api
`);

export default {
  port: config.port,
  fetch: app.fetch,
};
