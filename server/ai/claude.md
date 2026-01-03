# AI Module - Claude.md

## Overview

AI integration using **Vercel AI SDK** for model-agnostic streaming. Currently supports Anthropic Claude, but can easily swap models.

## Files

### `assistant.ts`

Main chat orchestration with streaming:

- Uses AI SDK's `streamText` for streaming responses
- Tool definitions with Zod schemas
- Async generator yields `StreamEvent` for real-time updates
- `maxSteps: 10` allows multi-turn tool use

## Architecture

### Streaming Events

The `chatStream` function yields these events:

```typescript
type StreamEvent =
  | { type: "text-delta"; content: string } // Streamed text chunk
  | { type: "tool-call"; toolName: string; args: unknown } // Tool invocation
  | { type: "tool-result"; toolName: string; result: unknown } // Tool response
  | { type: "ui"; html: string; css?: string; js?: string } // Rendered UI
  | { type: "done" }
  | { type: "error"; message: string };
```

### Tool Definitions

Using Vercel AI SDK's `tool()` helper with Zod schemas:

```typescript
const tools = {
  execute_sql: tool({
    description: "...",
    parameters: z.object({
      query: z.string(),
      params: z.array(z.any()).optional(),
    }),
    execute: async ({ query, params }) => {
      return await executeSQL(query, params ?? []);
    },
  }),
  // ...
};
```

## Available Tools

### Database

- `execute_sql` - Full SQL access
- `get_database_schema` - Inspect tables

### Storage

- `upload_file` - Store files in R2
- `get_file` - Retrieve files
- `delete_file` - Remove files
- `list_files` - List by prefix
- `get_upload_url` / `get_download_url` - Presigned URLs

### UI (via XML tags in text, not a tool)

The AI outputs `<render_ui>` XML tags directly in text, which the frontend parses and renders.

## Adding a New Tool

```typescript
new_tool: tool({
  description: "What this tool does",
  parameters: z.object({
    param1: z.string().describe("Description"),
    param2: z.number().optional(),
  }),
  execute: async ({ param1, param2 }) => {
    // Implementation
    return { success: true, data: ... };
  },
}),
```

## Model Configuration

Currently using `claude-sonnet-4-20250514` via `@ai-sdk/anthropic`.

To switch models:

```typescript
// OpenAI
import { openai } from "@ai-sdk/openai";
model: openai("gpt-4-turbo");

// Google
import { google } from "@ai-sdk/google";
model: google("gemini-pro");
```

## Streaming Flow

1. Client POSTs to `/api/chat`
2. Server calls `chatStream()`
3. Generator yields events as they occur
4. API streams events via SSE
5. Frontend renders each event type appropriately
