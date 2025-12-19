# Frontend Module - Claude.md

## Overview

React + Vite frontend with TypeScript. Real-time streaming chat with tool calls and AI-generated HTML responses.

## Structure

```
web/
├── src/
│   ├── main.tsx           # Entry point
│   ├── App.tsx            # Root component, health check, layout
│   ├── index.css          # All styles
│   ├── hooks/
│   │   └── useChat.ts     # Chat state & streaming logic
│   └── components/
│       ├── Chat.tsx       # Chat container, input form
│       ├── Message.tsx    # User & Assistant message rendering
│       ├── ToolCall.tsx   # Tool call display (collapsible)
│       └── ToolResult.tsx # Tool result display (collapsible)
├── index.html
└── vite.config.ts         # Vite config with API proxy
```

## Key Files

### `useChat.ts`

Custom hook managing chat state:

- `messages` - Array of Message objects with blocks
- `isLoading` - Streaming in progress
- `sendMessage(content)` - Send user message, stream response
- `stopGeneration()` - Abort current stream

Messages have blocks that can be text, tool-call, or tool-result:

```typescript
type Block =
  | { type: "text"; content: string }
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-result"; toolName: string; result: unknown };
```

### `Message.tsx`

Renders messages:

- User messages: simple styled div
- Assistant messages: blocks rendered in order, code toggle, copy button
- Scripts execute after streaming completes

### Vite Config

API requests proxy to backend:

```typescript
server: {
  port: 5173,
  proxy: {
    "/api": "http://localhost:3000"
  }
}
```

## Development

```bash
# From project root
bun run dev          # Runs both API and Vite

# Or separately
bun run dev:api      # API on :3000
bun run dev:web      # Vite on :5173
```

## Styling

All styles in `index.css`:

- CSS variables for theming
- Dark theme with orange/yellow/purple accents
- Responsive design
- Ambient gradient background

## Response Format

Assistant responses are HTML. The AI outputs:

- Simple: `<p>Got it.</p>`
- Rich: Full HTML with `<style>` and `<script>` tags

Scripts execute via `new Function('container', code)` after streaming.

