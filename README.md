# Jot

AI-powered second brain. Record everything, retrieve anything.

## Setup

```bash
bun install
cp server/env.example server/.env
# Edit server/.env with your credentials
```

## Development

```bash
bun run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173

## Structure

```
jot/
├── server/     # @jot/server - Bun + Hono API
├── web/        # @jot/web - React + Vite
└── package.json
```
