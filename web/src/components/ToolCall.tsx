import { useState } from "react";

interface Props {
  toolName: string;
  args: unknown;
}

export function ToolCall({ toolName, args }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Special handling for execute_python to show code nicely
  const isPython = toolName === "execute_python";
  const pythonCode = isPython && args && typeof args === "object" && "code" in args
    ? (args as { code: string }).code
    : null;

  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden text-[0.85rem]">
      <div 
        className="flex items-center gap-2 py-2 px-4 cursor-pointer select-none transition-colors hover:bg-bg-tertiary"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`text-[0.9rem] ${isPython ? "text-accent-secondary" : "text-text-muted"}`}>
          {isPython ? "🐍" : "⚡"}
        </span>
        <span className="font-mono font-normal text-xs text-text-secondary">
          {isPython ? "Python" : toolName}
        </span>
        {isPython && (
          <span className="ml-auto text-[0.7rem] text-text-muted tracking-wide">
            executing...
          </span>
        )}
      </div>
      <pre 
        className={`m-0 p-4 font-mono text-xs text-text-muted bg-bg-primary border-t border-border overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words select-text ${
          collapsed ? "hidden" : ""
        }`}
      >
        {pythonCode ?? JSON.stringify(args, null, 2)}
      </pre>
    </div>
  );
}
