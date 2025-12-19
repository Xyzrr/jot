import { useState, useCallback, useRef } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: Block[];
}

export type Block =
  | { type: "text"; content: string }
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-call-streaming"; toolName: string; partialArgs: string }
  | { type: "tool-result"; toolName: string; result: unknown };

interface ChatState {
  messages: Message[];
  isLoading: boolean;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        blocks: [{ type: "text", content }],
      };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        blocks: [],
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage, assistantMessage],
        isLoading: true,
      }));

      abortControllerRef.current = new AbortController();

      const showError = (error: string, details?: string) => {
        const errorContent = details
          ? `${error}\n\n\`\`\`\n${details}\n\`\`\``
          : error;
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  blocks: [
                    { type: "text", content: `⚠️ **Error:** ${errorContent}` },
                  ],
                  content: errorContent,
                }
              : m
          ),
        }));
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...state.messages, userMessage]
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ role: m.role, content: m.content })),
          }),
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
        let fullText = "";
        let currentBlockText = "";
        let blocks: Block[] = [];

        const updateAssistant = (newBlocks: Block[], newContent: string) => {
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, blocks: newBlocks, content: newContent }
                : m
            ),
          }));
        };

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
                  case "text-delta":
                    fullText += event.content;
                    currentBlockText += event.content;
                    // Update or add text block
                    const lastBlock = blocks[blocks.length - 1];
                    if (lastBlock?.type === "text") {
                      blocks = [
                        ...blocks.slice(0, -1),
                        { type: "text", content: currentBlockText },
                      ];
                    } else {
                      blocks = [
                        ...blocks,
                        { type: "text", content: currentBlockText },
                      ];
                    }
                    updateAssistant(blocks, fullText);
                    break;

                  case "tool-call-streaming":
                    // Update or add streaming block for code being generated
                    currentBlockText = ""; // Reset for next text block
                    const lastStreamingBlock = blocks[blocks.length - 1];
                    if (
                      lastStreamingBlock?.type === "tool-call-streaming" &&
                      lastStreamingBlock.toolName === event.toolName
                    ) {
                      // Update existing streaming block
                      blocks = [
                        ...blocks.slice(0, -1),
                        {
                          type: "tool-call-streaming",
                          toolName: event.toolName,
                          partialArgs: event.partialArgs,
                        },
                      ];
                    } else {
                      // Add new streaming block
                      blocks = [
                        ...blocks,
                        {
                          type: "tool-call-streaming",
                          toolName: event.toolName,
                          partialArgs: event.partialArgs,
                        },
                      ];
                    }
                    updateAssistant(blocks, fullText);
                    break;

                  case "tool-call":
                    currentBlockText = ""; // Reset for next text block
                    // Replace any streaming block with the final tool-call
                    const prevBlock = blocks[blocks.length - 1];
                    if (
                      prevBlock?.type === "tool-call-streaming" &&
                      prevBlock.toolName === event.toolName
                    ) {
                      blocks = [
                        ...blocks.slice(0, -1),
                        {
                          type: "tool-call",
                          toolName: event.toolName,
                          args: event.args,
                        },
                      ];
                    } else {
                      blocks = [
                        ...blocks,
                        {
                          type: "tool-call",
                          toolName: event.toolName,
                          args: event.args,
                        },
                      ];
                    }
                    updateAssistant(blocks, fullText);
                    break;

                  case "tool-result":
                    blocks = [
                      ...blocks,
                      {
                        type: "tool-result",
                        toolName: event.toolName,
                        result: event.result,
                      },
                    ];
                    updateAssistant(blocks, fullText);
                    break;

                  case "error":
                    const errorText = `⚠️ **Error:** ${event.message}`;
                    fullText += errorText;
                    blocks = [...blocks, { type: "text", content: errorText }];
                    updateAssistant(blocks, fullText);
                    break;
                }
              } catch (e) {
                console.error("Failed to parse SSE:", data, e);
                const parseError = `⚠️ **Parse error:** ${
                  (e as Error).message
                }\n\`\`\`\n${data}\n\`\`\``;
                fullText += parseError;
                blocks = [...blocks, { type: "text", content: parseError }];
                updateAssistant(blocks, fullText);
              }
            }
          }
        }
      } catch (error) {
        const err = error as Error;
        if (err.name === "AbortError") {
          // User cancelled, not an error
          return;
        }
        console.error("Chat error:", err);
        const errorMessage =
          err.name === "TypeError" && err.message === "Failed to fetch"
            ? "Network error - server may be down"
            : err.message || "Unknown error";
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  blocks: [
                    { type: "text", content: `⚠️ **Error:** ${errorMessage}` },
                  ],
                  content: errorMessage,
                }
              : m
          ),
        }));
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
    sendMessage,
    stopGeneration,
  };
}
