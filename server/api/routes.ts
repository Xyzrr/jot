import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { chatStream, type ModelMessage } from "../ai/assistant";
import {
  checkConnection,
  getSchema,
  executeSQL,
  saveMessage,
} from "../db/client";
import { listFiles } from "../storage/r2";

const api = new Hono();

// Enable CORS for development
api.use("/*", cors());

// Health check
api.get("/health", async (c) => {
  const dbConnected = await checkConnection();
  return c.json({
    status: "ok",
    database: dbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// Streaming chat endpoint using SSE
// This is the main endpoint - everything streams
api.post("/chat", async (c) => {
  const body = await c.req.json<{ messages: ModelMessage[] }>();

  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: "messages array required" }, 400);
  }

  // Save the user's message (the last one in the array) BEFORE AI processing
  // This ensures the AI can query it from the database if needed
  const userMessage = body.messages[body.messages.length - 1];
  if (userMessage?.role === "user") {
    const content =
      typeof userMessage.content === "string"
        ? userMessage.content
        : userMessage.content
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("");
    await saveMessage("user", content);
  }

  // Get abort signal from the request to handle client disconnection
  const abortSignal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    let assistantResponse = "";

    try {
      for await (const event of chatStream(body.messages, abortSignal)) {
        // Check if client disconnected
        if (abortSignal?.aborted) {
          break;
        }

        // Accumulate assistant text
        if (event.type === "text-delta") {
          assistantResponse += event.content;
        }

        await stream.writeSSE({ data: JSON.stringify(event) });

        // Save assistant response when done
        if (event.type === "done" && assistantResponse) {
          saveMessage("assistant", assistantResponse).catch(console.error);
        }
      }
    } catch (error) {
      const err = error as Error;
      // Don't send error for abort
      if (err.name !== "AbortError" && !abortSignal?.aborted) {
        await stream.writeSSE({
          data: JSON.stringify({ type: "error", message: err.message }),
        });
      }
    }
  });
});

// Debug endpoints (useful for development)
api.get("/debug/schema", async (c) => {
  try {
    const schema = await getSchema();
    return c.json({ schema });
  } catch (error) {
    const err = error as Error;
    return c.json({ error: err.message }, 500);
  }
});

api.post("/debug/sql", async (c) => {
  const { query, params } = await c.req.json<{
    query: string;
    params?: unknown[];
  }>();
  const result = await executeSQL(query, params);
  return c.json(result);
});

api.get("/debug/files", async (c) => {
  const prefix = c.req.query("prefix");
  const result = await listFiles(prefix);
  return c.json(result);
});

export { api };
