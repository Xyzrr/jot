# Jot

Your AI-powered second brain. Record everything, retrieve anything.

## Quick Start

```bash
# Install dependencies
bun install

# Set up environment
cp env.example .env
# Edit .env with your credentials

# Run
bun run dev
```

Open http://localhost:3000

## What is this?

Jot is a personal AI assistant that captures and organizes your life. The AI has full control over:

- **PostgreSQL database** - designs its own schema, runs migrations
- **Object storage** - stores files, voice recordings, images
- **Dynamic UI** - generates custom displays for your data

Talk to it via text or voice. It remembers everything.

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

- Bun + TypeScript
- Hono (API)
- Anthropic Claude (AI)
- Neon PostgreSQL
- Cloudflare R2

## License

MIT

