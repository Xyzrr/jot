# Database Module - Claude.md

## Overview
PostgreSQL database access using Neon (serverless Postgres) and postgres.js driver.

## Files

### `client.ts`
Database client and helper functions:
- `sql` - postgres.js client instance
- `executeSQL()` - Run arbitrary SQL (for AI use)
- `getSchema()` - Get current database schema
- `checkConnection()` - Health check

## Connection

Using Neon PostgreSQL with:
- SSL required (`sslmode=require`)
- Connection pooling (max 10 connections)
- Auto-reconnect on failure

## AI Database Access

The AI has full SQL access via `executeSQL()`. It can:
- Create/alter/drop tables
- Insert/update/delete data
- Run complex queries
- Create indexes
- Manage constraints

### Safety Considerations
- Neon has point-in-time recovery (time travel)
- AI is instructed to prefer soft deletes
- No destructive operations without user confirmation
- All operations are logged

## Schema Philosophy

The AI manages its own schema. Suggested patterns:

### Flexible Entry Table
```sql
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536), -- if using pgvector
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Specialized Tables
As patterns emerge, create dedicated tables:
- `books` - Reading list and notes
- `people` - Contacts and relationships  
- `projects` - Work tracking
- `learnings` - Specific knowledge items

### Linking
```sql
CREATE TABLE entry_links (
  from_id UUID REFERENCES entries(id),
  to_id UUID REFERENCES entries(id),
  relation TEXT,
  PRIMARY KEY (from_id, to_id, relation)
);
```

## Migrations

The AI runs migrations as needed:
```sql
-- Add column
ALTER TABLE entries ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);

-- Add constraint
ALTER TABLE entries ADD CONSTRAINT valid_type 
  CHECK (type IN ('note', 'learning', 'task', 'memory'));
```

## Query Patterns

### Full-text Search
```sql
SELECT * FROM entries 
WHERE to_tsvector('english', content) @@ plainto_tsquery('english', 'search terms');
```

### JSONB Queries
```sql
SELECT * FROM entries 
WHERE metadata->>'source' = 'voice'
  AND metadata->'tags' ? 'important';
```

### Time-based
```sql
SELECT * FROM entries 
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

