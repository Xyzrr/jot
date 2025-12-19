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

  const sendMessage = useCallback(async (content: string) => {
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

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

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
                    blocks = [...blocks, { type: "text", content: currentBlockText }];
                  }
                  updateAssistant(blocks, fullText);
                  break;

                case "tool-call":
                  currentBlockText = ""; // Reset for next text block
                  blocks = [
                    ...blocks,
                    { type: "tool-call", toolName: event.toolName, args: event.args },
                  ];
                  updateAssistant(blocks, fullText);
                  break;

                case "tool-result":
                  blocks = [
                    ...blocks,
                    { type: "tool-result", toolName: event.toolName, result: event.result },
                  ];
                  updateAssistant(blocks, fullText);
                  break;

                case "error":
                  blocks = [...blocks, { type: "text", content: `Error: ${event.message}` }];
                  updateAssistant(blocks, fullText);
                  break;
              }
            } catch (e) {
              console.error("Failed to parse SSE:", data, e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Chat error:", error);
      }
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
      abortControllerRef.current = null;
    }
  }, [state.messages]);

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

