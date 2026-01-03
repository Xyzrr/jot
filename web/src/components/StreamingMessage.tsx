import type { StreamingBlock } from "../hooks/useChat";
import { ToolCall } from "./ToolCall";
import { ToolResult } from "./ToolResult";
import { CodeStreaming } from "./CodeStreaming";

interface Props {
  blocks: StreamingBlock[];
  partialToolArgs: string;
  isStreamingToolCall: boolean;
}

export function StreamingMessage({
  blocks,
  partialToolArgs,
  isStreamingToolCall,
}: Props) {
  return (
    <div className="flex flex-col gap-4 animate-fade-in group">
      <div className="flex flex-col gap-4">
        {/* Render blocks in order */}
        {blocks.map((block, i) => {
          if (block.type === "text") {
            // Strip script tags for display
            const displayText = block.content.replace(
              /<script>[\s\S]*?<\/script>/gi,
              ""
            );
            return (
              displayText && (
                <div
                  key={i}
                  className="assistant-content"
                  dangerouslySetInnerHTML={{ __html: displayText }}
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
        {isStreamingToolCall && <CodeStreaming partialArgs={partialToolArgs} />}
      </div>

      {/* Breathing dot indicator */}
      <div className="w-1.5 h-1.5 bg-text-muted rounded-full opacity-0 animate-breathe" />
    </div>
  );
}
