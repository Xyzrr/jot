# Jot - AI-Assisted Development Guide

## ⚠️ IMPORTANT: Keep Documentation Updated

**When making changes to this project, always update the relevant `claude.md` files.** Each major directory has its own `claude.md` with specific context. Update them when:

- Adding new features or capabilities
- Changing architecture or data flow
- Adding new tools or integrations
- Modifying the database schema patterns

## Project Overview

Jot is a personal AI assistant for recording and retrieving life knowledge. The AI has full control over:

- **PostgreSQL database** (Neon) - schema design, migrations, queries
- **Object storage** (Cloudflare R2) - files, voice recordings, images
- **Dynamic UI generation** - arbitrary HTML/CSS/JS rendered inline

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Backend**: Hono (lightweight web framework)
- **AI**: Vercel AI SDK with Anthropic Claude (model-agnostic)
- **Database**: Neon PostgreSQL (postgres.js driver)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Frontend**: Vanilla HTML/CSS/JS with SSE streaming

## Project Structure

```
jot/
├── src/
│   ├── index.ts          # Entry point, Hono app setup
│   ├── config.ts         # Environment configuration
│   ├── ai/
│   │   └── assistant.ts  # AI SDK integration, tools, streaming
│   ├── db/
│   │   └── client.ts     # PostgreSQL client and helpers
│   ├── server/
│   │   └── api.ts        # API routes (SSE streaming)
│   └── storage/
│       └── r2.ts         # Cloudflare R2 client
├── public/
│   ├── index.html        # Chat UI
│   ├── styles.css        # Dark theme, tool/UI styles
│   └── app.js            # SSE client, streaming render
├── claude.md             # This file
└── env.example           # Environment variables template
```

## Key Concepts

### Streaming Everything

All responses stream via SSE with these event types:

- `text-delta` - Streamed text chunks
- `tool-call` - Tool invocation (shown to user)
- `tool-result` - Tool response (collapsible)
- `ui` - Rendered HTML/CSS/JS (inline)
- `done` / `error`

### AI Tool Access

Using Vercel AI SDK's `tool()` with Zod schemas:

1. `execute_sql` - Run any SQL query
2. `get_database_schema` - Inspect current schema
3. `upload_file` / `get_file` / `delete_file` / `list_files`
4. `get_upload_url` / `get_download_url` - Presigned URLs

### UI Rendering (XML Tags)

UI is NOT a tool - it's inline XML tags in the response text:

```xml
<render_ui>
<html>...</html>
<css>...</css>
<js>...</js>
</render_ui>
```

This streams naturally with the text, and the frontend parses/renders it progressively.

### Dynamic Schema

The AI decides its own database schema. It should:

- Start simple, evolve as patterns emerge
- Use JSONB for flexible data
- Add timestamps to everything
- Prefer soft deletes (Neon has time travel)

### UI Generation

The AI generates arbitrary HTML/CSS/JS:

- Rendered inline in the conversation timeline
- Full creative control - no templates
- JS executes with `container` reference

## Development

```bash
# Install dependencies
bun install

# Run development server (hot reload)
bun run dev

# Environment setup
cp env.example .env
# Fill in your credentials
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/chat` - SSE streaming chat
- `GET /api/debug/schema` - View database schema
- `POST /api/debug/sql` - Execute raw SQL
- `GET /api/debug/files` - List R2 files

## Design Decisions

1. **Vercel AI SDK** - Model-agnostic, excellent streaming support
2. **All streaming** - User sees everything as it happens
3. **Visible tool calls** - Technical user wants transparency
4. **Inline UIs** - Part of conversation history, re-visitable
5. **No ORM** - AI uses raw SQL for maximum flexibility
6. **Vanilla frontend** - Simple, no build step, easy to modify

## Common Tasks

### Adding a New Tool

Add to `tools` object in `src/ai/assistant.ts`:

```typescript
new_tool: tool({
  description: "...",
  parameters: z.object({ ... }),
  execute: async (args) => { ... },
}),
```

### Changing Models

In `src/ai/assistant.ts`:

```typescript
import { openai } from "@ai-sdk/openai";
model: openai("gpt-4-turbo");
```

### Modifying AI Behavior

System prompt is at top of `src/ai/assistant.ts`
