import {
  streamText,
  stepCountIs,
  tool,
  type ModelMessage,
  type ToolResultPart,
  type ToolApprovalResponse,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod/v4";
import { getSchema, getScratchpad, updateScratchpad } from "../db/client";
import { executePython, endPythonSession } from "../python/executor";

// Re-export ModelMessage for use by routes
export type { ModelMessage };

// System prompt
const SYSTEM_PROMPT = `You are Jot, a highly capable AI assistant that serves as a personal knowledge and life management system. You have direct access to:

1. **PostgreSQL Database (Neon)**: Full SQL access - you decide and evolve the schema as needed. Store anything: notes, learnings, tasks, memories, relationships, patterns. Use time-travel-friendly practices (don't hard delete).

2. **Object Storage (Cloudflare R2)**: Store files, images, voice recordings, documents. Organize with meaningful paths.

3. **Python Execution**: Run arbitrary Python code with full access to the database and R2 storage. Use this for complex data processing, analysis, visualizations, or any logic that's easier to express in Python.

## Your Role

You are the user's second brain. When they share information:
- Decide HOW to store it (what tables, what structure)
- Create or migrate schema as needed
- Extract and link related concepts
- Make it retrievable later

When they ask questions:
- Query your stored knowledge
- Present information in whatever format fits best
- Connect dots they might not see

## Database Philosophy

### Protected Table: messages
The \`messages\` table is managed by the source code. Required columns you must NOT remove:
- id (UUID, primary key)
- created_at (TIMESTAMPTZ)  
- role (TEXT - 'user' or 'assistant')
- content (TEXT)

You CAN add columns (e.g., embedding, summary, tags) but NEVER drop the table or these required columns.

### Memory Model
Every message (user and assistant) is automatically persisted to the \`messages\` table. However, **you don't automatically receive past messages** - each session starts fresh with only the current conversation context.

If you need historical context, **query the messages table yourself**. This gives you control over what context you pull in - recent messages, messages about a topic, messages mentioning a person, etc.

**Important**: The user's current message is saved to the database BEFORE you process it. This means you can always query it programmatically:
\`\`\`sql
SELECT content FROM messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 1
\`\`\`

Use this when you need the exact text of what the user said - for example, to write their messages to a file, extract data verbatim, or process their input without re-generating it from your context. This avoids AI "regurgitation" and ensures accuracy.

### Core Tables
- **\`messages\`** - the raw log of all exchanges. Query this to recall past context when needed.
- **\`entities\`** - the most important structure you'll create. Entities are people or organizations. This is the backbone of the knowledge graph. Track who the user knows, works with, talks about. Extract entity information from messages and store it here.
- Create other tables as structure emerges (e.g., 'projects', 'topics', 'books')
- Link tables for relationships between entities and other data

### AI-Native Data Storage
Don't over-normalize or convert everything to simple primitives. In the world of AI:
- Keep **raw text** alongside any extracted/structured fields - the original context is valuable for future LLM queries
- Use **pgvector** columns for embeddings when semantic search would be useful (e.g., finding similar notes, related people by context). Use Python's \`embed()\` function to generate 1536-dimension vectors.
- Preserve **nuance and ambiguity** - store "probably works at Google" as-is rather than forcing a clean company_id foreign key. Reality is messy; your schema should accommodate that.
- JSONB for flexible/nested data that doesn't need strict typing
- Full-text search indexes for keyword discovery

### Embeddings & Semantic Search
Use Python to generate and store embeddings in one step (avoids passing huge vectors around):
\`\`\`python
# Single item
vec = embed("your text")
execute("INSERT INTO items (content, embedding) VALUES (%s, %s)", [text, vec])

# Batch
texts = [row['content'] for row in query("SELECT content FROM items WHERE embedding IS NULL")]
vecs = embed_many(texts)
for text, vec in zip(texts, vecs):
    execute("UPDATE items SET embedding = %s WHERE content = %s", [vec, text])

# Query similar
query_vec = embed("search query")
results = query("SELECT * FROM items ORDER BY embedding <=> %s::vector LIMIT 5", [query_vec])
\`\`\`

### Suggesting App Features
If you identify a feature that would make this app more useful, suggest it to the user. For example, if you want an embedding column on the messages table that auto-populates when messages are sent, ask if they can add that. You can propose schema additions (columns, tables) that you'd manage, or actual code changes to the app itself.

## Response Format

ALL your responses are rendered as HTML. You have full control over presentation.

For simple responses, just use basic HTML:
<p>Got it, I've stored that.</p>

For rich displays, create whatever UI fits:
<style>
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.stat { background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; }
.stat-value { font-size: 2rem; font-weight: bold; color: var(--accent-primary); }
</style>
<div class="stats">
  <div class="stat"><div class="stat-value">42</div><div>entries</div></div>
  <div class="stat"><div class="stat-value">7</div><div>topics</div></div>
</div>
<p>Here's what I found in your knowledge base.</p>

For interactivity, add a script tag at the end:
<script>
document.querySelector('.btn').onclick = () => { /* ... */ };
</script>

Guidelines:
- Dark theme context: bg #0d0d0d, text #e8e8e8
- CSS variables available:
  - Backgrounds: --color-bg-primary (#0d0d0d), --color-bg-secondary (#141414), --color-bg-tertiary (#1a1a1a), --color-bg-elevated (#202020)
  - Text: --color-text-primary (#e8e8e8), --color-text-secondary (#888888), --color-text-muted (#555555)
  - Accents: --color-accent-primary (#c4735c), --color-accent-secondary (#8b9a7d), --color-accent-tertiary (#7d8ba0)
  - Status: --color-success (#8b9a7d), --color-warning (#c4a35c), --color-error (#b85c5c)
  - Borders: --color-border (rgba(255,255,255,0.04)), --color-border-subtle, --color-border-focus
- Keep it minimal for simple responses - don't over-design
- Go rich when displaying data, queries, visualizations
- Use inline styles or <style> tags (scoped to your classes)
- SVG for charts, semantic HTML, modern CSS

## Personality

Be concise but warm. You're a trusted partner in capturing and connecting knowledge. Don't over-explain unless asked. When storing information, just confirm briefly what you captured.

Don't introduce yourself or explain who you are - assume we already know each other and skip the pleasantries.

## Scratchpad

You have a scratchpad for notes about your data architecture decisions. Use it to document:
- What tables you've created and why
- How you've structured the postgres schema
- How you're organizing files in R2 storage
- Any conventions or patterns you're following

The scratchpad content is injected into this system prompt every message, so you always have access to your architectural notes. Use the \`update_scratchpad\` tool whenever you make significant schema or storage decisions - this helps you maintain consistency across sessions.

## Current Context

Check the database schema at conversation start to understand what structures exist. Create what you need.`;

// Tool definitions using Zod schemas
const tools = {
  execute_python: tool({
    description: `Execute arbitrary Python code with full access to the database and R2 storage. This is your primary tool for all data operations - use it instead of separate SQL or file tools.

**Variables persist within a turn**: You can define variables in one Python execution and use them in subsequent executions within the same turn. This is like a Jupyter notebook - state accumulates.

Available functions in the Python environment:

**Database:**
- query(sql, params=None) - Execute SQL and return results as list of dicts
- execute(sql, params=None) - Execute SQL statement (INSERT/UPDATE/DELETE)

**R2 Storage:**
- upload_file(key, data, content_type=None) - Upload bytes/string to R2
- download_file(key) - Download from R2 (returns bytes)
- list_files(prefix='', max_keys=100) - List R2 files
- delete_file(key) - Delete from R2
- get_upload_url(key, content_type, expires_in=3600) - Generate presigned upload URL
- get_download_url(key, expires_in=3600) - Generate presigned download URL

**Embeddings:**
- embed(text) - Generate 1536-dim embedding for text (OpenAI text-embedding-3-small)
- embed_many(texts) - Generate embeddings for multiple texts in batch

Print statements will be captured as output. The last expression's value is NOT automatically returned - use print() to output results.

Example:
\`\`\`python
import pandas as pd
results = query("SELECT * FROM entries LIMIT 10")
df = pd.DataFrame(results)
print(df.describe().to_string())
\`\`\``,
    inputSchema: z.object({
      code: z.string().describe("The Python code to execute"),
    }),
    execute: async ({ code }: { code: string }) => {
      return await executePython(code);
    },
  }),

  update_scratchpad: tool({
    description: `Update your scratchpad with notes about your data architecture decisions. The scratchpad is injected into your system prompt each message, so you always see your notes.

Use this to document:
- Tables you've created and their purpose
- Schema design decisions and rationale
- R2 storage organization (folder structure, naming conventions)
- Patterns or conventions you're following

This completely replaces the previous scratchpad content, so include everything you want to remember.`,
    inputSchema: z.object({
      content: z
        .string()
        .describe(
          "The full scratchpad content (replaces existing content entirely)"
        ),
    }),
    execute: async ({ content }: { content: string }) => {
      await updateScratchpad(content);
      return { success: true, message: "Scratchpad updated" };
    },
  }),
};

// Get initial context about the database and scratchpad
async function getContextInjection(): Promise<string> {
  let context = "";

  // Fetch scratchpad
  try {
    const scratchpad = await getScratchpad();
    if (scratchpad && scratchpad.trim()) {
      context += `\n\n## Your Scratchpad Notes\n\n${scratchpad}`;
    } else {
      context +=
        "\n\n[Scratchpad is empty - use update_scratchpad to record your architectural decisions]";
    }
  } catch {
    context += "\n\n[Could not fetch scratchpad]";
  }

  // Fetch database schema
  try {
    const schema = await getSchema();
    if (Array.isArray(schema) && schema.length === 0) {
      context +=
        "\n\n[Database is empty - no tables exist yet. Create schema as needed.]";
    } else {
      context += `\n\n[Current database schema: ${JSON.stringify(schema)}]`;
    }
  } catch {
    context +=
      "\n\n[Could not fetch database schema - database may be initializing]";
  }

  return context;
}

// Truncate large tool results to avoid blowing up context window
function truncateResult(result: unknown, maxLength = 8000): string {
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= maxLength) return str;
  return (
    str.slice(0, maxLength) +
    `\n... [truncated, ${str.length - maxLength} more characters]`
  );
}

// Truncate tool results in messages before sending to model
function truncateToolResults(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        ...msg,
        content: msg.content.map(
          (part: ToolResultPart | ToolApprovalResponse) => {
            // Skip ToolApprovalResponse parts
            if (!("output" in part)) {
              return part;
            }
            const toolPart = part as ToolResultPart;
            // Handle both old string format and new ToolResultOutput format
            const outputValue =
              typeof toolPart.output === "string"
                ? toolPart.output
                : toolPart.output.type === "text"
                ? toolPart.output.value
                : JSON.stringify(toolPart.output);
            return {
              ...toolPart,
              output: {
                type: "text" as const,
                value: truncateResult(outputValue),
              },
            };
          }
        ),
      };
    }
    return msg;
  });
}

// Stream events that get sent to the client
export type StreamEvent =
  | { type: "text-delta"; content: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-call-streaming"; toolName: string; partialArgs: string }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: unknown;
    }
  | { type: "done" }
  | { type: "error"; message: string };

// Main streaming chat function
export async function* chatStream(
  messages: ModelMessage[],
  abortSignal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const contextInjection = await getContextInjection();

  let hasYieldedContent = false;

  try {
    const result = streamText({
      model: anthropic("claude-opus-4-5-20251101"),
      system: SYSTEM_PROMPT + contextInjection,
      messages: truncateToolResults(messages),
      tools,
      stopWhen: stepCountIs(10), // Allow multiple tool calls in sequence
      abortSignal,
    });

    // Track which tool calls are for code execution (to stream their args)
    const streamingToolCalls = new Map<string, string>();

    for await (const event of result.fullStream) {
      // Check if aborted before processing each event
      if (abortSignal?.aborted) {
        return;
      }

      switch (event.type) {
        case "text-delta":
          hasYieldedContent = true;
          yield { type: "text-delta", content: event.text };
          break;

        case "tool-input-start":
          // Start tracking this tool call if it's execute_python
          if (event.toolName === "execute_python") {
            streamingToolCalls.set(event.id, "");
            // Emit immediately so client shows streaming UI right away
            yield {
              type: "tool-call-streaming",
              toolName: "execute_python",
              partialArgs: "",
            };
          }
          break;

        case "tool-input-delta":
          // Stream partial args for execute_python tool
          if (streamingToolCalls.has(event.id)) {
            const currentArgs = streamingToolCalls.get(event.id) || "";
            const newArgs = currentArgs + event.delta;
            streamingToolCalls.set(event.id, newArgs);
            yield {
              type: "tool-call-streaming",
              toolName: "execute_python",
              partialArgs: newArgs,
            };
          }
          break;

        case "tool-call":
          hasYieldedContent = true;
          // Clear streaming state when tool call is complete
          streamingToolCalls.delete(event.toolCallId);
          yield {
            type: "tool-call",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.input,
          };
          break;

        case "tool-result":
          yield {
            type: "tool-result",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.output,
          };
          break;
      }
    }

    // If the model returned nothing, let the user know
    if (!hasYieldedContent) {
      console.error("[chatStream] Model returned no content");
      yield {
        type: "error",
        message:
          "Model returned empty response. This may be due to API configuration issues or the model rejecting the request.",
      };
    }

    yield { type: "done" };
  } catch (error) {
    const err = error as Error;
    // Don't log or yield error for aborts - it's expected behavior
    if (err.name === "AbortError" || abortSignal?.aborted) {
      return;
    }
    console.error("[chatStream] Error:", err.message, err.stack);
    yield { type: "error", message: err.message };
  } finally {
    // Clean up the Python session at the end of each turn
    // This ensures a fresh session for the next turn while allowing
    // variables to persist across multiple Python executions within this turn
    endPythonSession();
  }
}
