/**
 * Standalone test script to verify Anthropic API tool call parameter streaming.
 *
 * Tests whether tool arguments stream incrementally or arrive all at once.
 *
 * Run with: bun run test-anthropic-streaming.ts
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// A tool that takes a long code parameter - perfect for testing streaming
const tools: Anthropic.Tool[] = [
  {
    name: "execute_python",
    description:
      "Execute Python code. Use this to run any Python code the user requests.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "The Python code to execute",
        },
      },
      required: ["code"],
    },
  },
];

async function testToolCallStreaming() {
  console.log("=".repeat(60));
  console.log("Testing Anthropic API Tool Call Parameter Streaming");
  console.log("=".repeat(60));
  console.log();

  // A prompt that should generate a long code response
  const userMessage =
    "Write Python code that creates a complete FastAPI application with user authentication, including models, routes for login/register/logout, JWT token handling, password hashing with bcrypt, and a SQLite database. Make it production-ready with proper error handling. Put ALL the code in a single execute_python call - do NOT split it up across multiple calls. I want one big code block with everything.";

  console.log("Prompt:", userMessage);
  console.log();
  console.log("-".repeat(60));
  console.log("Streaming output (with timestamps):");
  console.log("-".repeat(60));
  console.log();

  const startTime = Date.now();
  let lastEventTime = startTime;
  let inputJsonBuffer = "";
  let chunkCount = 0;
  let totalInputJsonLength = 0;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    tools,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  for await (const event of stream) {
    const now = Date.now();
    const timeSinceStart = now - startTime;
    const timeSinceLast = now - lastEventTime;
    lastEventTime = now;

    console.log(event);

    // We're specifically interested in tool use events
    if (event.type === "content_block_start") {
      if (event.content_block.type === "tool_use") {
        console.log(
          `[${timeSinceStart}ms] content_block_start: tool_use "${event.content_block.name}"`
        );
        console.log(`         Tool ID: ${event.content_block.id}`);
        inputJsonBuffer = "";
        chunkCount = 0;
      } else if (event.content_block.type === "text") {
        console.log(`[${timeSinceStart}ms] content_block_start: text`);
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "input_json_delta") {
        chunkCount++;
        const partialJson = event.delta.partial_json;
        inputJsonBuffer += partialJson;
        totalInputJsonLength = inputJsonBuffer.length;

        // Log each chunk with timing info
        const chunkPreview =
          partialJson.length > 80
            ? partialJson.slice(0, 80) + "..."
            : partialJson;
        console.log(
          `[${timeSinceStart}ms +${timeSinceLast}ms] input_json_delta #${chunkCount}: ${partialJson.length} chars`
        );
        console.log(`         Preview: ${JSON.stringify(chunkPreview)}`);
      } else if (event.delta.type === "text_delta") {
        const text = event.delta.text;
        const preview = text.length > 50 ? text.slice(0, 50) + "..." : text;
        console.log(
          `[${timeSinceStart}ms +${timeSinceLast}ms] text_delta: ${text.length} chars "${preview}"`
        );
      }
    } else if (event.type === "content_block_stop") {
      console.log(`[${timeSinceStart}ms] content_block_stop`);
      if (inputJsonBuffer) {
        console.log();
        console.log("-".repeat(60));
        console.log("Tool Call Summary:");
        console.log("-".repeat(60));
        console.log(`Total chunks received: ${chunkCount}`);
        console.log(`Total JSON length: ${totalInputJsonLength} chars`);
        console.log(
          `Average chunk size: ${Math.round(
            totalInputJsonLength / chunkCount
          )} chars`
        );

        // Parse and show the final args
        try {
          const args = JSON.parse(inputJsonBuffer);
          console.log();
          console.log("Parsed arguments:");
          console.log(`  code length: ${args.code?.length || 0} characters`);
          console.log();
          console.log("Code preview (first 500 chars):");
          console.log(args.code?.slice(0, 500) || "(no code)");
        } catch (e) {
          console.log("Failed to parse JSON:", e);
        }
      }
    } else if (event.type === "message_stop") {
      console.log(`[${timeSinceStart}ms] message_stop`);
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log("Analysis:");
  console.log("=".repeat(60));
  console.log();
  console.log("If you see many small chunks (< 100 chars each) arriving");
  console.log("over time with increasing timestamps, streaming is working.");
  console.log();
  console.log("If you see one or a few large chunks arriving all at once,");
  console.log("then tool call parameters are NOT streaming properly.");
  console.log();
}

testToolCallStreaming().catch(console.error);
