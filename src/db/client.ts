import postgres from "postgres";
import { config } from "../config";

// Create postgres client with Neon
// Using postgres.js for raw SQL access - the AI will manage its own schema
export const sql = postgres(config.databaseUrl, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Helper to run arbitrary SQL (for AI use)
export async function executeSQL(query: string, params: unknown[] = []) {
  try {
    const result = await sql.unsafe(query, params);
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

