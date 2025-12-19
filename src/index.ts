import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { api } from "./server/api";
import { config } from "./config";

const app = new Hono();

// API routes
app.route("/api", api);

// Serve static files from public directory
app.use("/*", serveStatic({ root: "./public" }));

// Fallback to index.html for SPA routing
app.get("*", serveStatic({ path: "./public/index.html" }));

console.log(`
🚀 Jot is running!
   
   Local:   http://localhost:${config.port}
   API:     http://localhost:${config.port}/api
   Health:  http://localhost:${config.port}/api/health
`);

export default {
  port: config.port,
  fetch: app.fetch,
};

