# Jot

**Keep `claude.md` files updated when making changes.**

## Overview

Personal AI assistant with full control over PostgreSQL (Neon) and object storage (Cloudflare R2). All responses are HTML—AI controls presentation.

## Structure

```
jot/
├── server/           # @jot/server
│   ├── package.json
│   ├── .env          # credentials (from env.example)
│   ├── index.ts      # entry
│   ├── config.ts     # env loader
│   ├── ai/           # assistant, tools
│   ├── api/          # routes
│   ├── db/           # postgres client
│   └── storage/      # r2 client
├── web/              # @jot/web
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
└── package.json      # workspace root
```

## Commands

```bash
bun install                        # install all
bun run dev                        # run both
bun --filter @jot/server dev       # server only
bun --filter @jot/web dev          # web only
bun run build                      # build all
```

## Key Files

- `server/ai/assistant.ts` - system prompt, tools, streaming
- `server/api/routes.ts` - HTTP endpoints
- `web/src/hooks/useChat.ts` - chat state, SSE handling
- `web/src/components/Message.tsx` - message rendering

## Adding a Tool

```typescript
// server/ai/assistant.ts
my_tool: tool({
  description: "...",
  parameters: z.object({ ... }),
  execute: async (args) => { ... },
}),
```

## SSE Events

`POST /api/chat` streams:

- `text-delta` - content chunk
- `tool-call` - tool invocation
- `tool-result` - tool response
- `done` / `error`
