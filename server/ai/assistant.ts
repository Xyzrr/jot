import { streamText, tool, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { executeSQL, getSchema } from "../db/client";
import {
  uploadFile,
  getFile,
  deleteFile,
  listFiles,
  getUploadUrl,
  getDownloadUrl,
} from "../storage/r2";

// System prompt
const SYSTEM_PROMPT = `You are Jot, a highly capable AI assistant that serves as a personal knowledge and life management system. You have direct access to:

1. **PostgreSQL Database (Neon)**: Full SQL access - you decide and evolve the schema as needed. Store anything: notes, learnings, tasks, memories, relationships, patterns. Use time-travel-friendly practices (don't hard delete).

2. **Object Storage (Cloudflare R2)**: Store files, images, voice recordings, documents. Organize with meaningful paths.

## Your Role

You are the user's second brain. When they share information:
- Decide HOW to store it (what tables, what structure)
- Create or migrate schema as needed
- Extract and link related concepts
- Make it retrievable later

When they ask questions:
- Query your stored knowledge
- Present information in whatever format fits best
- Connect dots they might not see

## Database Philosophy

Start simple, evolve as needed. Some suggested patterns:
- A flexible 'entries' table for general notes/learnings with JSONB for metadata
- Separate tables when structure emerges (e.g., 'books', 'people', 'projects')
- Link tables for relationships
- Full-text search indexes for discovery

## Response Format

ALL your responses are rendered as HTML. You have full control over presentation.

For simple responses, just use basic HTML:
<p>Got it, I've stored that.</p>

For rich displays, create whatever UI fits:
<style>
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.stat { background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; }
.stat-value { font-size: 2rem; font-weight: bold; color: var(--accent-primary); }
</style>
<div class="stats">
  <div class="stat"><div class="stat-value">42</div><div>entries</div></div>
  <div class="stat"><div class="stat-value">7</div><div>topics</div></div>
</div>
<p>Here's what I found in your knowledge base.</p>

For interactivity, add a script tag at the end:
<script>
document.querySelector('.btn').onclick = () => { /* ... */ };
</script>

Guidelines:
- Dark theme context: bg #0a0a0f, text #f0f0f5
- CSS variables available: --accent-primary (#ff6b35), --accent-secondary (#ffc857), --bg-secondary, --bg-tertiary
- Keep it minimal for simple responses - don't over-design
- Go rich when displaying data, queries, visualizations
- Use inline styles or <style> tags (scoped to your classes)
- SVG for charts, semantic HTML, modern CSS

## Personality

Be concise but warm. You're a trusted partner in capturing and connecting knowledge. Don't over-explain unless asked. When storing information, just confirm briefly what you captured.

## Current Context

Check the database schema at conversation start to understand what structures exist. Create what you need.`;

// Tool definitions using Zod schemas
const tools = {
  execute_sql: tool({
    description: `Execute arbitrary SQL against the PostgreSQL database. You have FULL control - create tables, insert data, query, update, delete, run migrations. The database uses Neon PostgreSQL with time-travel, so feel free to experiment.

Best practices:
- Create indexes for frequently queried columns
- Use JSONB for flexible/nested data
- Add timestamps (created_at, updated_at) to tables
- Don't delete data unless explicitly asked - prefer soft deletes`,
    parameters: z.object({
      query: z.string().describe("The SQL query to execute"),
      params: z
        .array(z.any())
        .optional()
        .describe("Optional parameters for parameterized queries"),
    }),
    execute: async ({ query, params }) => {
      return await executeSQL(query, params ?? []);
    },
  }),

  get_database_schema: tool({
    description:
      "Get the current database schema - all tables and their columns. Use this to understand what data structures exist.",
    parameters: z.object({}),
    execute: async () => {
      return await getSchema();
    },
  }),

  upload_file: tool({
    description:
      "Upload a file to Cloudflare R2 object storage. Use for storing images, voice recordings, documents, or any binary data.",
    parameters: z.object({
      key: z
        .string()
        .describe(
          "The storage key/path for the file (e.g., 'voice/2024-01-15/recording.webm')"
        ),
      content: z.string().describe("Base64-encoded file content"),
      contentType: z.string().describe("MIME type of the file"),
      metadata: z
        .record(z.string())
        .optional()
        .describe("Optional metadata key-value pairs"),
    }),
    execute: async ({ key, content, contentType, metadata }) => {
      const buffer = Buffer.from(content, "base64");
      return await uploadFile(key, buffer, contentType, metadata);
    },
  }),

  get_file: tool({
    description: "Retrieve a file from R2 storage by its key.",
    parameters: z.object({
      key: z.string().describe("The storage key/path of the file"),
    }),
    execute: async ({ key }) => {
      const result = await getFile(key);
      if (result.success && result.data) {
        return {
          ...result,
          data: Buffer.from(result.data).toString("base64"),
        };
      }
      return result;
    },
  }),

  delete_file: tool({
    description: "Delete a file from R2 storage.",
    parameters: z.object({
      key: z.string().describe("The storage key/path of the file to delete"),
    }),
    execute: async ({ key }) => {
      return await deleteFile(key);
    },
  }),

  list_files: tool({
    description: "List files in R2 storage, optionally filtered by prefix.",
    parameters: z.object({
      prefix: z
        .string()
        .optional()
        .describe(
          "Optional prefix to filter files (e.g., 'voice/' for all voice recordings)"
        ),
      maxKeys: z
        .number()
        .optional()
        .describe("Maximum number of files to return (default 100)"),
    }),
    execute: async ({ prefix, maxKeys }) => {
      return await listFiles(prefix, maxKeys);
    },
  }),

  get_upload_url: tool({
    description:
      "Generate a presigned URL for direct file upload. Useful for large files or client-side uploads.",
    parameters: z.object({
      key: z.string().describe("The storage key/path for the file"),
      contentType: z.string().describe("MIME type of the file"),
      expiresIn: z
        .number()
        .optional()
        .describe("URL expiration time in seconds (default 3600)"),
    }),
    execute: async ({ key, contentType, expiresIn }) => {
      return await getUploadUrl(key, contentType, expiresIn);
    },
  }),

  get_download_url: tool({
    description: "Generate a presigned URL for file download.",
    parameters: z.object({
      key: z.string().describe("The storage key/path of the file"),
      expiresIn: z
        .number()
        .optional()
        .describe("URL expiration time in seconds (default 3600)"),
    }),
    execute: async ({ key, expiresIn }) => {
      return await getDownloadUrl(key, expiresIn);
    },
  }),
};

// Get initial context about the database
async function getDatabaseContext(): Promise<string> {
  try {
    const schema = await getSchema();
    if (Array.isArray(schema) && schema.length === 0) {
      return "\n\n[Database is empty - no tables exist yet. Create schema as needed.]";
    }
    return `\n\n[Current database schema: ${JSON.stringify(schema)}]`;
  } catch {
    return "\n\n[Could not fetch database schema - database may be initializing]";
  }
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Stream events that get sent to the client
export type StreamEvent =
  | { type: "text-delta"; content: string }
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: "done" }
  | { type: "error"; message: string };

// Main streaming chat function
export async function* chatStream(
  messages: Message[]
): AsyncGenerator<StreamEvent> {
  const dbContext = await getDatabaseContext();

  // Convert to AI SDK message format
  const coreMessages: CoreMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const result = streamText({
      model: anthropic("claude-opus-4-5-20251101"),
      system: SYSTEM_PROMPT + dbContext,
      messages: coreMessages,
      tools,
      maxSteps: 10, // Allow multiple tool calls in sequence
    });

    for await (const event of result.fullStream) {
      switch (event.type) {
        case "text-delta":
          yield { type: "text-delta", content: event.textDelta };
          break;

        case "tool-call":
          yield {
            type: "tool-call",
            toolName: event.toolName,
            args: event.args,
          };
          break;

        case "tool-result":
          yield {
            type: "tool-result",
            toolName: event.toolName,
            result: event.result,
          };
          break;
      }
    }

    yield { type: "done" };
  } catch (error) {
    const err = error as Error;
    yield { type: "error", message: err.message };
  }
}
