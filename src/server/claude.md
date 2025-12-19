# Server Module - Claude.md

## Overview
HTTP API using Hono framework, optimized for Bun runtime.

## Files

### `api.ts`
API route definitions:
- Health check endpoint
- Chat endpoints (standard and streaming)
- Debug endpoints for development

## Endpoints

### `GET /api/health`
Health check returning:
- Server status
- Database connection status
- Timestamp

### `POST /api/chat`
Main chat endpoint:
- Input: `{ messages: [{ role, content }] }`
- Output: `{ response: string, ui?: { components, layout } }`
- Handles full agentic conversation loop

### `POST /api/chat/stream`
Server-Sent Events streaming:
- Same input as `/api/chat`
- Streams: `{ type: "text", content }` for text chunks
- Streams: `{ type: "ui", content }` for UI components
- Streams: `{ type: "done" }` on completion
- Streams: `{ type: "error", content }` on errors

### Debug Endpoints
Development-only endpoints:
- `GET /api/debug/schema` - View database schema
- `POST /api/debug/sql` - Execute raw SQL
- `GET /api/debug/files` - List R2 files

## Middleware

- CORS enabled for all routes (development)
- Static file serving from `/public`
- SPA fallback to `index.html`

## Adding Endpoints

```typescript
// GET endpoint
api.get("/endpoint", async (c) => {
  return c.json({ data: "value" });
});

// POST endpoint with body
api.post("/endpoint", async (c) => {
  const body = await c.req.json<{ field: string }>();
  return c.json({ received: body.field });
});

// With query params
api.get("/search", async (c) => {
  const q = c.req.query("q");
  return c.json({ query: q });
});
```

## Error Handling

```typescript
try {
  // operation
} catch (error) {
  const err = error as Error;
  return c.json({ error: err.message }, 500);
}
```

## Future Considerations

- Add authentication (API keys, sessions)
- Rate limiting for production
- Request logging
- Webhook endpoints for integrations

