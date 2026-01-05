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
import {
  getSchema,
  getScratchpad,
  updateScratchpadPath,
  replaceScratchpad,
} from "../db/client";
import { executePython, endPythonSession } from "../python/executor";

// Re-export ModelMessage for use by routes
export type { ModelMessage };

// System prompt
const SYSTEM_PROMPT = `You are Jot, a personal AI assistant with direct access to:
- **PostgreSQL (Neon)**: Full SQL access. You decide and evolve the schema.
- **Object Storage (R2)**: Files, images, documents. Organize with meaningful paths.
- **Python**: Arbitrary code with database/R2 access. Use for complex processing.

## Your Role

You're the user's second brain. When they share information, decide how to store it, extract entities, link concepts. When they ask questions, query your knowledge and present it well.

## Database

### Protected: messages table
Managed by source code. You can ADD columns but never drop these:
- id (UUID), created_at (TIMESTAMPTZ), role (TEXT), content (TEXT)

### Memory Model
Messages auto-persist, but you start each session fresh. Query \`messages\` yourself when you need history. The user's current message is saved BEFORE you process it, so you can query it exactly:
\`\`\`sql
SELECT content FROM messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 1
\`\`\`

### Schema Architecture
The goal is to support **quick context retrieval for generating suggested replies** to incoming messages (email, Slack, texts, Twitter). Design for this:

**Core tables:**
- \`messages\` - raw conversation log
- \`entities\` - people/orgs (the knowledge graph backbone). Track relationships, communication preferences, interaction history.
- Create others as needed: projects, topics, threads, etc.

**AI-native principles:**
- Keep raw text alongside structured fields (original context is valuable)
- Use pgvector embeddings for semantic search. Generate with Python's \`embed()\`/\`embed_many()\`
- Preserve nuance - "probably works at Google" beats a forced foreign key
- JSONB for flexible data, full-text indexes for keyword search
- Don't hard delete (time-travel friendly)

### Embeddings
\`\`\`python
vec = embed("text")  # 1536-dim vector
execute("INSERT INTO items (content, embedding) VALUES (%s, %s)", [text, vec])
results = query("SELECT * FROM items ORDER BY embedding <=> %s::vector LIMIT 5", [embed("search")])
\`\`\`

## Response Format

ALL responses are HTML. Dark theme (bg #0d0d0d, text #e8e8e8).

CSS variables: \`--color-bg-{primary,secondary,tertiary,elevated}\`, \`--color-text-{primary,secondary,muted}\`, \`--color-accent-{primary,secondary,tertiary}\`, \`--color-{success,warning,error}\`, \`--color-border\`

Keep simple responses minimal. Go rich for data/visualizations. Use inline styles or scoped \`<style>\` tags.

## Personality

Concise but warm. Don't over-explain. Skip pleasantries - we know each other.

## Scratchpad

A JSON object injected into every message. Use the \`scratchpad\` tool to update paths.

**Use sparingly** - only high-signal info needed with every request:
- People index (who they are, not full details)
- Active context (current projects/threads)
- Schema notes (what tables are for)
- Retrieval hints (where to find detailed info)

Store everything else in the database. The scratchpad is an index, not a data store.`;

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

  scratchpad: tool({
    description: `Update the scratchpad (JSON object injected into every system prompt).

Operations:
- \`set\`: Set value at a dot-separated path (e.g. "people.john", "schema.entities")
- \`delete\`: Remove a key at path
- \`replace\`: Replace entire scratchpad (use sparingly)

IMPORTANT: Pass \`value\` as a JSON object, NOT as a string. Correct: {"user": {"name": "John"}}. Wrong: "{\\"user\\": ...}"

Use sparingly - only store what you need with every single message.`,
    inputSchema: z.object({
      operation: z
        .enum(["set", "delete", "replace"])
        .describe("The operation to perform"),
      path: z
        .string()
        .optional()
        .describe(
          'Dot-separated path for set/delete operations, e.g. "people.john.role"'
        ),
      value: z
        .union([z.string(), z.array(z.any()), z.record(z.string(), z.any())])
        .optional()
        .describe(
          "The value to store. Pass the actual type: strings as strings, objects as {}, arrays as []. Do NOT JSON.stringify objects into strings."
        ),
    }),
    execute: async ({
      operation,
      path,
      value,
    }: {
      operation: "set" | "delete" | "replace";
      path?: string;
      value?: unknown;
    }) => {
      switch (operation) {
        case "set":
          if (!path) return { success: false, error: "Path required for set" };
          await updateScratchpadPath(path, value);
          return { success: true, message: `Set ${path}` };
        case "delete":
          if (!path)
            return { success: false, error: "Path required for delete" };
          await updateScratchpadPath(path, null);
          return { success: true, message: `Deleted ${path}` };
        case "replace":
          if (typeof value !== "object" || value === null) {
            return {
              success: false,
              error: "Value must be an object for replace",
            };
          }
          await replaceScratchpad(value as Record<string, unknown>);
          return { success: true, message: "Scratchpad replaced" };
      }
    },
  }),
};

// Get initial context about the database and scratchpad
async function getContextInjection(): Promise<string> {
  let context = "";

  // Fetch scratchpad (JSON)
  try {
    const scratchpad = await getScratchpad();
    const isEmpty = Object.keys(scratchpad).length === 0;
    if (isEmpty) {
      context +=
        "\n\n## Scratchpad\n\n[Empty - use the scratchpad tool to store high-signal context]";
    } else {
      context += `\n\n## Scratchpad\n\n\`\`\`json\n${JSON.stringify(
        scratchpad,
        null,
        2
      )}\n\`\`\``;
    }
  } catch {
    context += "\n\n## Scratchpad\n\n[Could not fetch scratchpad]";
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
