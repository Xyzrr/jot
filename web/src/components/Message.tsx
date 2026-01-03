import { useState, useRef, useEffect } from "react";
import type { Message as MessageType, Block } from "../hooks/useChat";
import { ToolCall } from "./ToolCall";
import { ToolResult } from "./ToolResult";
import { CodeStreaming } from "./CodeStreaming";

interface Props {
  message: MessageType;
  isStreaming?: boolean;
}

export function Message({ message, isStreaming }: Props) {
  if (message.role === "user") {
    return (
      <div className="self-end max-w-[85%] py-2 px-4 bg-bg-tertiary text-text-primary rounded-lg ml-auto text-[0.95rem] select-text animate-fade-in whitespace-pre-wrap">
        {message.content}
      </div>
    );
  }

  return <AssistantMessage message={message} isStreaming={isStreaming} />;
}

function AssistantMessage({ message, isStreaming }: Props) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Execute scripts after streaming completes
  useEffect(() => {
    if (!isStreaming && contentRef.current && message.content) {
      const scripts = message.content.match(/<script>([\s\S]*?)<\/script>/gi);
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
  }, [isStreaming, message.content]);

  // Group tool calls with their results
  const groupedBlocks = groupToolBlocks(message.blocks);

  return (
    <div className="flex flex-col gap-4 animate-fade-in group">
      <div className="flex flex-col gap-4" ref={contentRef}>
        {groupedBlocks.map((item, i) => {
          if (item.type === "tool-group") {
            return (
              <div key={i} className="tool-group">
                <ToolCall
                  toolName={item.call.toolName}
                  args={item.call.args}
                  hasResult={!!item.result}
                />
                {item.result && (
                  <ToolResult
                    toolName={item.result.toolName}
                    result={item.result.result}
                  />
                )}
              </div>
            );
          }
          return <BlockRenderer key={i} block={item.block} />;
        })}
      </div>

      {isStreaming && (
        <div className="w-1.5 h-1.5 bg-text-muted rounded-full opacity-0 animate-breathe" />
      )}

      {showCode && (
        <div className="mt-2">
          <pre className="m-0 p-4 bg-bg-secondary border border-border rounded-lg font-mono text-xs text-text-muted overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-words">
            <code className="bg-transparent p-0">{message.content}</code>
          </pre>
        </div>
      )}

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
    </div>
  );
}

type GroupedItem = 
  | { type: "tool-group"; call: Extract<Block, { type: "tool-call" }>; result?: Extract<Block, { type: "tool-result" }> }
  | { type: "block"; block: Block };

function groupToolBlocks(blocks: Block[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === "tool-call") {
      const nextBlock = blocks[i + 1];
      // Check if next block is the matching result
      if (nextBlock?.type === "tool-result" && nextBlock.toolCallId === block.toolCallId) {
        result.push({
          type: "tool-group",
          call: block,
          result: nextBlock,
        });
        i += 2;
      } else {
        // Tool call without result yet
        result.push({
          type: "tool-group",
          call: block,
        });
        i += 1;
      }
    } else if (block.type === "tool-result") {
      // Orphan result (shouldn't happen but handle gracefully)
      result.push({ type: "block", block });
      i += 1;
    } else {
      result.push({ type: "block", block });
      i += 1;
    }
  }

  return result;
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return <TextBlock content={block.content} />;
    case "tool-call-streaming":
      return <CodeStreaming partialArgs={block.partialArgs} />;
    default:
      return null;
  }
}

function TextBlock({ content }: { content: string }) {
  // Strip script tags for display (they execute separately)
  const displayContent = content.replace(/<script>[\s\S]*?<\/script>/gi, "");

  return (
    <div
      className="assistant-content"
      dangerouslySetInnerHTML={{ __html: displayContent }}
    />
  );
}
