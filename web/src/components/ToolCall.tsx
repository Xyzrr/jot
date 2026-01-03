import { useState } from "react";

interface Props {
  toolName: string;
  args: unknown;
  hasResult?: boolean;
}

export function ToolCall({ toolName, args, hasResult }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const isPython = toolName === "execute_python";
  const isScratchpad = toolName === "update_scratchpad";

  // Extract content for display
  const displayContent = isPython
    ? (args as { code?: string })?.code
    : isScratchpad
      ? (args as { content?: string })?.content
      : JSON.stringify(args, null, 2);

  const icon = isPython ? "🐍" : isScratchpad ? "📝" : "⚡";
  const label = isPython ? "Python" : isScratchpad ? "Scratchpad" : toolName;

  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden text-[0.85rem]">
      <div
        className="flex items-center gap-2 py-2 px-4 cursor-pointer select-none transition-colors hover:bg-bg-tertiary"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[0.9rem] text-accent-secondary">{icon}</span>
        <span className="font-mono font-normal text-xs text-text-secondary">
          {label}
        </span>
        {isPython && !hasResult && (
          <span className="ml-auto text-[0.7rem] text-text-muted tracking-wide flex items-center gap-1.5">
            executing
            <span className="w-1 h-1 rounded-full bg-text-muted animate-breathe" />
          </span>
        )}
      </div>
      <pre
        className={`m-0 p-4 font-mono text-xs text-text-muted bg-bg-primary border-t border-border overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words select-text ${
          collapsed ? "hidden" : ""
        }`}
      >
        {displayContent}
      </pre>
    </div>
  );
}
