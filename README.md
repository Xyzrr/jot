# Jot

Your AI-powered second brain. Record everything, retrieve anything.

## Quick Start

```bash
# Install dependencies
bun install
cd web && bun install && cd ..

# Set up environment
cp env.example .env
# Edit .env with your credentials

# Run both servers
bun run dev
```

Open http://localhost:5173

## What is this?

Jot is a personal AI assistant that captures and organizes your life. The AI has full control over:

- **PostgreSQL database** - designs its own schema, runs migrations
- **Object storage** - stores files, voice recordings, images
- **Response presentation** - all responses are HTML, AI controls the UI

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=jot-storage
```

## Tech Stack

- **Backend**: Bun + Hono + Vercel AI SDK
- **Frontend**: React + Vite + TypeScript
- **AI**: Anthropic Claude
- **Database**: Neon PostgreSQL
- **Storage**: Cloudflare R2

## License

MIT
