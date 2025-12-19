# Jot - AI-Assisted Development Guide

## ⚠️ IMPORTANT: Keep Documentation Updated

**When making changes to this project, always update the relevant `claude.md` files.** Each major directory has its own `claude.md` with specific context.

## Project Overview

Jot is a personal AI assistant for recording and retrieving life knowledge. The AI has full control over:

- **PostgreSQL database** (Neon) - schema design, migrations, queries
- **Object storage** (Cloudflare R2) - files, voice recordings, images
- **Dynamic UI** - responses are HTML, AI controls presentation

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono + Vercel AI SDK (Anthropic Claude)
- **Frontend**: React + Vite + TypeScript
- **Database**: Neon PostgreSQL
- **Storage**: Cloudflare R2

## Project Structure

```
jot/
├── src/                    # Backend (Bun + Hono)
│   ├── index.ts            # API server entry
│   ├── config.ts           # Environment config
│   ├── ai/
│   │   └── assistant.ts    # AI SDK, tools, streaming
│   ├── db/
│   │   └── client.ts       # PostgreSQL client
│   ├── server/
│   │   └── api.ts          # API routes
│   └── storage/
│       └── r2.ts           # R2 client
├── web/                    # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── hooks/useChat.ts
│   │   └── components/
│   └── vite.config.ts
├── package.json
└── claude.md
```

## Development

```bash
# Install all dependencies
bun install
cd web && bun install && cd ..

# Run both servers (API :3000, Vite :5173)
bun run dev

# Or separately
bun run dev:api
bun run dev:web
```

Open http://localhost:5173

## Key Concepts

### Streaming

SSE stream from `/api/chat` with events:

- `text-delta` - Streamed text
- `tool-call` - Tool invocation
- `tool-result` - Tool response
- `done` / `error`

### Response Format

ALL assistant responses are HTML. AI decides presentation:

- Simple: `<p>Got it.</p>`
- Rich: Tables, charts, interactive elements with `<script>`

### Tools

Using Vercel AI SDK `tool()`:

1. `execute_sql` - Full database access
2. `get_database_schema` - Introspect tables
3. `upload_file` / `get_file` / `delete_file` / `list_files`
4. `get_upload_url` / `get_download_url`

## Adding Features

### New Tool

In `src/ai/assistant.ts`:

```typescript
new_tool: tool({
  description: "...",
  parameters: z.object({ ... }),
  execute: async (args) => { ... },
}),
```

### New Component

In `web/src/components/`:

```tsx
export function MyComponent({ prop }: Props) {
  return <div>...</div>;
}
```

### Changing AI Behavior

System prompt at top of `src/ai/assistant.ts`
