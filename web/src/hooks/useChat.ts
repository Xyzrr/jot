import { useState, useCallback, useRef } from "react";
import type { ModelMessage } from "ai";

// Re-export for convenience
export type { ModelMessage };

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Uploaded file metadata (matches server response)
export interface UploadedFile {
  key: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

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
  // Attached files (for display in UI)
  files?: UploadedFile[];
}

interface ChatState {
  messages: MessageWithId[];
  isLoading: boolean;
  // Streaming state - blocks in order as they arrive
  streamingBlocks: StreamingBlock[];
  // For streaming code display
  partialToolArgs: string;
  isStreamingToolCall: boolean;
  // ID of the currently streaming assistant message (for stable React keys)
  currentAssistantId: string | null;
  // Upload progress
  isUploading: boolean;
}

// Upload files to the server
async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Upload failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.files;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    streamingBlocks: [],
    partialToolArgs: "",
    isStreamingToolCall: false,
    currentAssistantId: null,
    isUploading: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string, files?: File[]) => {
      // Handle file uploads first if any
      let uploadedFiles: UploadedFile[] | undefined;

      if (files && files.length > 0) {
        setState((prev) => ({ ...prev, isUploading: true }));
        try {
          uploadedFiles = await uploadFiles(files);
        } catch (error) {
          const err = error as Error;
          setState((prev) => ({
            ...prev,
            isUploading: false,
            messages: [
              ...prev.messages,
              {
                id: crypto.randomUUID(),
                message: {
                  role: "assistant",
                  content: `<p>⚠️ <strong>Upload failed:</strong> ${err.message}</p>`,
                },
              },
            ],
          }));
          return;
        }
        setState((prev) => ({ ...prev, isUploading: false }));
      }

      // Build full message content (file info + user text)
      let content = text;
      if (uploadedFiles && uploadedFiles.length > 0) {
        const fileInfo = uploadedFiles
          .map(
            (f) =>
              `[Attached file: ${f.name} (${f.type}, ${formatFileSize(
                f.size
              )})] R2 key: ${f.key}`
          )
          .join("\n");
        content = fileInfo + (text ? "\n\n" + text : "");
      }

      const userMessage: MessageWithId = {
        id: crypto.randomUUID(),
        message: { role: "user", content },
        files: uploadedFiles,
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
        currentAssistantId: assistantId,
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
                    // For multi-step tool use, we need to interleave assistant/tool messages
                    // Each tool call must be immediately followed by its result
                    const newMessages: MessageWithId[] = [];

                    // Group blocks into "steps" - a new step starts after a tool-result
                    // when we see more content (text or another tool-call)
                    type Step = {
                      content: Array<
                        | { type: "text"; text: string }
                        | {
                            type: "tool-call";
                            toolCallId: string;
                            toolName: string;
                            input: unknown;
                          }
                      >;
                      toolResults: Array<{
                        toolCallId: string;
                        toolName: string;
                        result: unknown;
                      }>;
                    };

                    const steps: Step[] = [];
                    let currentStep: Step = { content: [], toolResults: [] };
                    let lastWasToolResult = false;

                    for (const block of blocks) {
                      if (block.type === "text") {
                        // If we had tool results and now have new content, start new step
                        if (
                          lastWasToolResult &&
                          currentStep.toolResults.length > 0
                        ) {
                          steps.push(currentStep);
                          currentStep = { content: [], toolResults: [] };
                        }
                        currentStep.content.push({
                          type: "text",
                          text: block.content,
                        });
                        lastWasToolResult = false;
                      } else if (block.type === "tool-call") {
                        // If we had tool results and now have a new tool call, start new step
                        if (
                          lastWasToolResult &&
                          currentStep.toolResults.length > 0
                        ) {
                          steps.push(currentStep);
                          currentStep = { content: [], toolResults: [] };
                        }
                        currentStep.content.push({
                          type: "tool-call",
                          toolCallId: block.toolCallId,
                          toolName: block.toolName,
                          input: block.args,
                        });
                        if (block.result !== undefined) {
                          currentStep.toolResults.push({
                            toolCallId: block.toolCallId,
                            toolName: block.toolName,
                            result: block.result,
                          });
                          lastWasToolResult = true;
                        }
                      }
                    }

                    // Don't forget the last step
                    if (currentStep.content.length > 0) {
                      steps.push(currentStep);
                    }

                    // Build messages from steps
                    for (let i = 0; i < steps.length; i++) {
                      const step = steps[i];
                      if (step.content.length > 0) {
                        newMessages.push({
                          id: i === 0 ? assistantId : crypto.randomUUID(),
                          message: {
                            role: "assistant",
                            content:
                              step.content.length === 1 &&
                              step.content[0].type === "text"
                                ? step.content[0].text
                                : step.content,
                          },
                        });
                      }

                      if (step.toolResults.length > 0) {
                        newMessages.push({
                          id: crypto.randomUUID(),
                          message: {
                            role: "tool",
                            content: step.toolResults.map((tr) => ({
                              type: "tool-result" as const,
                              toolCallId: tr.toolCallId,
                              toolName: tr.toolName,
                              output: tr.result,
                            })),
                          } as ModelMessage,
                        });
                      }
                    }

                    setState((prev) => ({
                      ...prev,
                      messages: [...prev.messages, ...newMessages],
                      isLoading: false,
                      streamingBlocks: [],
                      partialToolArgs: "",
                      isStreamingToolCall: false,
                      currentAssistantId: null,
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
          // User cancelled - finalize whatever we have so far
          setState((prev) => {
            if (prev.streamingBlocks.length === 0) {
              // Nothing was streamed yet, just reset
              return {
                ...prev,
                isLoading: false,
                currentAssistantId: null,
              };
            }

            // Convert streaming blocks to finalized messages
            const newMessages: MessageWithId[] = [];
            type Step = {
              content: Array<
                | { type: "text"; text: string }
                | {
                    type: "tool-call";
                    toolCallId: string;
                    toolName: string;
                    input: unknown;
                  }
              >;
              toolResults: Array<{
                toolCallId: string;
                toolName: string;
                result: unknown;
              }>;
            };

            const steps: Step[] = [];
            let currentStep: Step = { content: [], toolResults: [] };
            let lastWasToolResult = false;

            for (const block of prev.streamingBlocks) {
              if (block.type === "text") {
                if (lastWasToolResult && currentStep.toolResults.length > 0) {
                  steps.push(currentStep);
                  currentStep = { content: [], toolResults: [] };
                }
                currentStep.content.push({ type: "text", text: block.content });
                lastWasToolResult = false;
              } else if (block.type === "tool-call") {
                if (lastWasToolResult && currentStep.toolResults.length > 0) {
                  steps.push(currentStep);
                  currentStep = { content: [], toolResults: [] };
                }
                currentStep.content.push({
                  type: "tool-call",
                  toolCallId: block.toolCallId,
                  toolName: block.toolName,
                  input: block.args,
                });
                if (block.result !== undefined) {
                  currentStep.toolResults.push({
                    toolCallId: block.toolCallId,
                    toolName: block.toolName,
                    result: block.result,
                  });
                  lastWasToolResult = true;
                }
              }
            }

            if (currentStep.content.length > 0) {
              steps.push(currentStep);
            }

            for (let i = 0; i < steps.length; i++) {
              const step = steps[i];
              if (step.content.length > 0) {
                newMessages.push({
                  id: i === 0 ? assistantId : crypto.randomUUID(),
                  message: {
                    role: "assistant",
                    content:
                      step.content.length === 1 &&
                      step.content[0].type === "text"
                        ? step.content[0].text
                        : step.content,
                  },
                });
              }

              if (step.toolResults.length > 0) {
                newMessages.push({
                  id: crypto.randomUUID(),
                  message: {
                    role: "tool",
                    content: step.toolResults.map((tr) => ({
                      type: "tool-result" as const,
                      toolCallId: tr.toolCallId,
                      toolName: tr.toolName,
                      output: tr.result,
                    })),
                  } as ModelMessage,
                });
              }
            }

            return {
              ...prev,
              messages: [...prev.messages, ...newMessages],
              isLoading: false,
              streamingBlocks: [],
              partialToolArgs: "",
              isStreamingToolCall: false,
              currentAssistantId: null,
            };
          });
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
    isUploading: state.isUploading,
    // Streaming state for UI
    streamingBlocks: state.streamingBlocks,
    partialToolArgs: state.partialToolArgs,
    isStreamingToolCall: state.isStreamingToolCall,
    currentAssistantId: state.currentAssistantId,
    sendMessage,
    stopGeneration,
  };
}
