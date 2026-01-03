import { useState, useCallback, useRef } from "react";
import type { ModelMessage } from "ai";

// Re-export for convenience
export type { ModelMessage };

// Block types for streaming display (preserves order)
export type StreamingBlock =
  | { type: "text"; content: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: unknown;
      result?: unknown;
    };

// Local ID tracking for React keys (ModelMessage doesn't have IDs)
export interface MessageWithId {
  id: string;
  message: ModelMessage;
}

interface ChatState {
  messages: MessageWithId[];
  isLoading: boolean;
  // Streaming state - blocks in order as they arrive
  streamingBlocks: StreamingBlock[];
  // For streaming code display
  partialToolArgs: string;
  isStreamingToolCall: boolean;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    streamingBlocks: [],
    partialToolArgs: "",
    isStreamingToolCall: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: MessageWithId = {
        id: crypto.randomUUID(),
        message: { role: "user", content },
      };

      // Placeholder for assistant response
      const assistantId = crypto.randomUUID();

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        streamingBlocks: [],
        partialToolArgs: "",
        isStreamingToolCall: false,
      }));

      abortControllerRef.current = new AbortController();

      const showError = (error: string, details?: string) => {
        const errorContent = details
          ? `<p>⚠️ <strong>Error:</strong> ${error}</p><pre>${details}</pre>`
          : `<p>⚠️ <strong>Error:</strong> ${error}</p>`;
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: assistantId,
              message: { role: "assistant", content: errorContent },
            },
          ],
          isLoading: false,
        }));
      };

      try {
        // Convert to ModelMessage[] for the API
        const apiMessages: ModelMessage[] = state.messages.map(
          (m) => m.message
        );
        apiMessages.push({ role: "user", content });

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          showError(`HTTP ${response.status} ${response.statusText}`, text);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          showError("No response body from server");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        // Track blocks in order
        let blocks: StreamingBlock[] = [];
        let partialArgs = "";

        const updateBlocks = (newBlocks: StreamingBlock[]) => {
          blocks = newBlocks;
          setState((prev) => ({
            ...prev,
            streamingBlocks: blocks,
          }));
        };

        let receivedDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (!data) continue;

              try {
                const event = JSON.parse(data);

                switch (event.type) {
                  case "text-delta": {
                    // Append to last text block or create new one
                    const lastBlock = blocks[blocks.length - 1];
                    if (lastBlock?.type === "text") {
                      updateBlocks([
                        ...blocks.slice(0, -1),
                        {
                          type: "text",
                          content: lastBlock.content + event.content,
                        },
                      ]);
                    } else {
                      updateBlocks([
                        ...blocks,
                        { type: "text", content: event.content },
                      ]);
                    }
                    break;
                  }

                  case "tool-call-streaming": {
                    partialArgs = event.partialArgs;
                    setState((prev) => ({
                      ...prev,
                      partialToolArgs: partialArgs,
                      isStreamingToolCall: true,
                    }));
                    break;
                  }

                  case "tool-call": {
                    // Add tool call block
                    updateBlocks([
                      ...blocks,
                      {
                        type: "tool-call",
                        toolCallId: event.toolCallId,
                        toolName: event.toolName,
                        args: event.args,
                      },
                    ]);
                    setState((prev) => ({
                      ...prev,
                      partialToolArgs: "",
                      isStreamingToolCall: false,
                    }));
                    break;
                  }

                  case "tool-result": {
                    // Find the tool call block and attach result
                    const updatedBlocks = blocks.map((block) => {
                      if (
                        block.type === "tool-call" &&
                        block.toolCallId === event.toolCallId
                      ) {
                        return { ...block, result: event.result };
                      }
                      return block;
                    });
                    updateBlocks(updatedBlocks);
                    break;
                  }

                  case "done": {
                    receivedDone = true;
                    // Finalize the messages in ModelMessage format
                    const newMessages: MessageWithId[] = [];

                    // Extract text and tool calls for ModelMessage format
                    let fullText = "";
                    const toolCalls: Array<{
                      toolCallId: string;
                      toolName: string;
                      args: unknown;
                    }> = [];
                    const toolResults: Array<{
                      toolCallId: string;
                      toolName: string;
                      result: unknown;
                    }> = [];

                    for (const block of blocks) {
                      if (block.type === "text") {
                        fullText += block.content;
                      } else if (block.type === "tool-call") {
                        toolCalls.push({
                          toolCallId: block.toolCallId,
                          toolName: block.toolName,
                          args: block.args,
                        });
                        if (block.result !== undefined) {
                          toolResults.push({
                            toolCallId: block.toolCallId,
                            toolName: block.toolName,
                            result: block.result,
                          });
                        }
                      }
                    }

                    // Build assistant message content
                    if (fullText || toolCalls.length > 0) {
                      const assistantContent: Array<
                        | { type: "text"; text: string }
                        | {
                            type: "tool-call";
                            toolCallId: string;
                            toolName: string;
                            input: unknown;
                          }
                      > = [];

                      // Add parts in order from blocks
                      for (const block of blocks) {
                        if (block.type === "text") {
                          assistantContent.push({
                            type: "text",
                            text: block.content,
                          });
                        } else if (block.type === "tool-call") {
                          assistantContent.push({
                            type: "tool-call",
                            toolCallId: block.toolCallId,
                            toolName: block.toolName,
                            input: block.args,
                          });
                        }
                      }

                      newMessages.push({
                        id: assistantId,
                        message: {
                          role: "assistant",
                          content:
                            assistantContent.length === 1 &&
                            assistantContent[0].type === "text"
                              ? assistantContent[0].text
                              : assistantContent,
                        },
                      });
                    }

                    // Add tool results as separate tool message
                    if (toolResults.length > 0) {
                      newMessages.push({
                        id: crypto.randomUUID(),
                        message: {
                          role: "tool",
                          content: toolResults.map((tr) => ({
                            type: "tool-result" as const,
                            toolCallId: tr.toolCallId,
                            toolName: tr.toolName,
                            output: tr.result,
                          })),
                        } as ModelMessage,
                      });
                    }

                    setState((prev) => ({
                      ...prev,
                      messages: [...prev.messages, ...newMessages],
                      isLoading: false,
                      streamingBlocks: [],
                      partialToolArgs: "",
                      isStreamingToolCall: false,
                    }));
                    break;
                  }

                  case "error": {
                    const errorText = `<p>⚠️ <strong>Error:</strong> ${event.message}</p>`;
                    // Append error to last text block or create new one
                    const lastBlock = blocks[blocks.length - 1];
                    if (lastBlock?.type === "text") {
                      updateBlocks([
                        ...blocks.slice(0, -1),
                        {
                          type: "text",
                          content: lastBlock.content + errorText,
                        },
                      ]);
                    } else {
                      updateBlocks([
                        ...blocks,
                        { type: "text", content: errorText },
                      ]);
                    }
                    break;
                  }
                }
              } catch (e) {
                console.error("Failed to parse SSE:", data, e);
              }
            }
          }
        }

        // If stream ended without a proper "done" event, show error
        if (!receivedDone) {
          const hasContent = blocks.some(
            (b) => b.type === "text" && b.content.trim()
          );
          if (!hasContent) {
            // No content at all - show a clear error
            showError(
              "No response received",
              "The server closed the connection without sending a response. Check server logs for details."
            );
          } else {
            // Had some content but ended abruptly - finalize what we have
            setState((prev) => ({
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: assistantId,
                  message: {
                    role: "assistant",
                    content:
                      blocks
                        .filter((b) => b.type === "text")
                        .map((b) => (b as { content: string }).content)
                        .join("") +
                      '<p style="color: var(--color-warning);">⚠️ Stream ended unexpectedly</p>',
                  },
                },
              ],
              isLoading: false,
              streamingBlocks: [],
            }));
          }
        }
      } catch (error) {
        const err = error as Error;
        if (err.name === "AbortError") {
          return;
        }
        console.error("Chat error:", err);
        const errorMessage =
          err.name === "TypeError" && err.message === "Failed to fetch"
            ? "Network error - server may be down"
            : err.message || "Unknown error";
        showError(errorMessage);
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
        abortControllerRef.current = null;
      }
    },
    [state.messages]
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    // Streaming state for UI
    streamingBlocks: state.streamingBlocks,
    partialToolArgs: state.partialToolArgs,
    isStreamingToolCall: state.isStreamingToolCall,
    sendMessage,
    stopGeneration,
  };
}
