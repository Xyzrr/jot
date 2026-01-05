import postgres from "postgres";
import { config } from "../config";

// Create postgres client with Neon
// Using postgres.js for raw SQL access - the AI will manage its own schema
export const sql = postgres(config.databaseUrl, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Suppress "already exists, skipping" notices
});

// Helper to run arbitrary SQL (for AI use)
export async function executeSQL(query: string, params: unknown[] = []) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sql.unsafe(query, params as any[]);
    return { success: true, data: result, rowCount: result.length };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Get database schema information
export async function getSchema() {
  const tables = await sql`
    SELECT 
      t.table_name,
      array_agg(
        json_build_object(
          'column', c.column_name,
          'type', c.data_type,
          'nullable', c.is_nullable
        ) ORDER BY c.ordinal_position
      ) as columns
    FROM information_schema.tables t
    JOIN information_schema.columns c 
      ON t.table_name = c.table_name 
      AND t.table_schema = c.table_schema
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_name
    ORDER BY t.table_name
  `;
  return tables;
}

// Check database connection
export async function checkConnection() {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// Protected table: messages
// The source code depends on this table existing with these exact columns.
// The AI can ADD columns but must never DROP these required columns or the table itself.
export async function ensureMessagesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      role TEXT NOT NULL,
      content TEXT NOT NULL
    )
  `;

  // Index for querying by time
  await sql`
    CREATE INDEX IF NOT EXISTS messages_created_at_idx 
    ON messages (created_at DESC)
  `;
}

// Save a message - used by source code after each exchange
export async function saveMessage(role: "user" | "assistant", content: string) {
  const [row] = await sql`
    INSERT INTO messages (role, content)
    VALUES (${role}, ${content})
    RETURNING *
  `;
  return row;
}

// Scratchpad - AI's notes injected into every system prompt
// Stored as JSONB for path-based updates
export async function ensureScratchpadTable() {
  // Check if old TEXT column exists and migrate to JSONB
  const [existingCol] = await sql`
    SELECT data_type FROM information_schema.columns 
    WHERE table_name = 'ai_scratchpad' AND column_name = 'content'
  `;

  if (existingCol?.data_type === "text") {
    // Migrate: rename old column, add new JSONB column, copy data
    await sql`ALTER TABLE ai_scratchpad RENAME COLUMN content TO content_old`;
    await sql`ALTER TABLE ai_scratchpad ADD COLUMN content JSONB NOT NULL DEFAULT '{}'::jsonb`;
    // Try to parse old content as JSON, fallback to wrapping in {notes: ...}
    await sql`
      UPDATE ai_scratchpad 
      SET content = CASE 
        WHEN content_old = '' THEN '{}'::jsonb
        WHEN content_old ~ '^\\s*\\{' THEN content_old::jsonb
        ELSE jsonb_build_object('_migrated_notes', content_old)
      END
    `;
    await sql`ALTER TABLE ai_scratchpad DROP COLUMN content_old`;
  } else if (!existingCol) {
    // Fresh install - create table with JSONB
    await sql`
      CREATE TABLE IF NOT EXISTS ai_scratchpad (
        key TEXT PRIMARY KEY DEFAULT 'main',
        content JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  }

  // Insert default row if not exists
  await sql`
    INSERT INTO ai_scratchpad (key, content)
    VALUES ('main', '{}'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `;
}

// Returns the full scratchpad as a JSON object
export async function getScratchpad(): Promise<Record<string, unknown>> {
  try {
    const [row] = await sql`
      SELECT content FROM ai_scratchpad WHERE key = 'main'
    `;
    return (row?.content as Record<string, unknown>) ?? {};
  } catch {
    // Table might not exist yet
    return {};
  }
}

// Update a specific path in the scratchpad
// path: JSON path like "relationships.john" or "projects.active"
// value: the value to set (null to delete the path)
export async function updateScratchpadPath(
  path: string,
  value: unknown
): Promise<void> {
  const pathParts = path.split(".");

  if (value === null) {
    // Delete the path - use #- operator to remove the key
    await sql`
      UPDATE ai_scratchpad 
      SET content = content #- ${pathParts},
          updated_at = now()
      WHERE key = 'main'
    `;
  } else {
    // Set the value at path using sql.json() to properly serialize
    await sql`
      UPDATE ai_scratchpad 
      SET content = jsonb_set(
        content,
        ${pathParts},
        ${sql.json(value)},
        true
      ),
      updated_at = now()
      WHERE key = 'main'
    `;
  }
}

// Replace the entire scratchpad (for when AI wants to restructure)
export async function replaceScratchpad(
  content: Record<string, unknown>
): Promise<void> {
  await sql`
    UPDATE ai_scratchpad 
    SET content = ${sql.json(content)},
        updated_at = now()
    WHERE key = 'main'
  `;
}
