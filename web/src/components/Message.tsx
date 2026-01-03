import { useState, useRef, useEffect } from "react";
import type { ModelMessage } from "ai";
import type { StreamingBlock } from "../hooks/useChat";
import { ToolCall } from "./ToolCall";
import { ToolResult } from "./ToolResult";
import { CodeStreaming } from "./CodeStreaming";

interface Props {
  message: ModelMessage;
  toolResults?: Map<string, { toolName: string; result: unknown }>;
}

export function Message({ message, toolResults }: Props) {
  if (message.role === "user") {
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("");
    return (
      <div className="self-end max-w-[85%] py-2 px-4 bg-bg-tertiary text-text-primary rounded-lg ml-auto text-[0.95rem] select-text animate-fade-in whitespace-pre-wrap">
        {content}
      </div>
    );
  }

  if (message.role === "assistant") {
    return <AssistantMessage message={message} toolResults={toolResults} />;
  }

  // Tool messages are rendered as part of assistant messages
  return null;
}

// Streaming mode props
interface StreamingProps {
  streaming: {
    blocks: StreamingBlock[];
    partialToolArgs: string;
    isStreamingToolCall: boolean;
  };
  message?: never;
  toolResults?: never;
}

// Completed mode props
interface CompletedProps {
  streaming?: never;
  message: Extract<ModelMessage, { role: "assistant" }>;
  toolResults?: Map<string, { toolName: string; result: unknown }>;
}

type AssistantMessageProps = StreamingProps | CompletedProps;

export function AssistantMessage({
  streaming,
  message,
  toolResults,
}: AssistantMessageProps) {
  const isStreaming = !!streaming;
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Normalize to common block format for rendering
  type RenderBlock =
    | { type: "text"; content: string }
    | {
        type: "tool-call";
        toolCallId: string;
        toolName: string;
        args: unknown;
        result?: unknown;
      };

  let blocks: RenderBlock[] = [];
  let fullText = "";

  if (isStreaming) {
    // Streaming mode - blocks are already in the right format
    blocks = streaming.blocks;
    fullText = blocks
      .filter((b) => b.type === "text")
      .map((b) => (b as { content: string }).content)
      .join("");
  } else if (message) {
    // Completed mode - normalize ModelMessage content to blocks
    const content = message.content;
    if (typeof content === "string") {
      blocks = [{ type: "text", content }];
      fullText = content;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text") {
          blocks.push({ type: "text", content: part.text });
          fullText += part.text;
        } else if (part.type === "tool-call") {
          const result = toolResults?.get(part.toolCallId);
          blocks.push({
            type: "tool-call",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
            result: result?.result,
          });
        }
      }
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Execute scripts after render (only for completed messages)
  useEffect(() => {
    if (!isStreaming && contentRef.current && fullText) {
      const scripts = fullText.match(/<script>([\s\S]*?)<\/script>/gi);
      if (scripts) {
        scripts.forEach((script) => {
          const code = script.replace(/<\/?script>/gi, "");
          try {
            const fn = new Function("container", code);
            fn(contentRef.current);
          } catch (e) {
            console.error("Script execution error:", e);
          }
        });
      }
    }
  }, [isStreaming, fullText]);

  return (
    <div className="flex flex-col gap-4 animate-fade-in group">
      <div className="flex flex-col gap-4" ref={contentRef}>
        {/* Render blocks in order */}
        {blocks.map((block, i) => {
          if (block.type === "text") {
            const displayContent = block.content.replace(
              /<script>[\s\S]*?<\/script>/gi,
              ""
            );
            return (
              displayContent && (
                <div
                  key={i}
                  className="assistant-content"
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                />
              )
            );
          }

          if (block.type === "tool-call") {
            return (
              <div key={block.toolCallId} className="tool-group">
                <ToolCall
                  toolName={block.toolName}
                  args={block.args}
                  hasResult={block.result !== undefined}
                />
                {block.result !== undefined && (
                  <ToolResult toolName={block.toolName} result={block.result} />
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Currently streaming tool call */}
        {isStreaming && streaming.isStreamingToolCall && (
          <CodeStreaming partialArgs={streaming.partialToolArgs} />
        )}
      </div>

      {/* Streaming: breathing dot indicator */}
      {isStreaming && (
        <div className="w-1.5 h-1.5 bg-text-muted rounded-full opacity-0 animate-breathe" />
      )}

      {/* Completed: view code panel */}
      {!isStreaming && showCode && (
        <div className="mt-2">
          <pre className="m-0 p-4 bg-bg-secondary border border-border rounded-lg font-mono text-xs text-text-muted overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-words">
            <code className="bg-transparent p-0">{fullText}</code>
          </pre>
        </div>
      )}

      {/* Completed: action buttons */}
      {!isStreaming && (
        <div className="flex gap-0.5 mt-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className={`flex items-center justify-center w-6 h-6 p-0 bg-transparent border-none cursor-pointer rounded transition-colors ${
              showCode
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
            onClick={() => setShowCode(!showCode)}
            title="View code"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
          <button
            className={`flex items-center justify-center w-6 h-6 p-0 bg-transparent border-none cursor-pointer rounded transition-colors ${
              copied
                ? "text-success"
                : "text-text-muted hover:text-text-secondary"
            }`}
            onClick={handleCopy}
            title="Copy"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
