import { useState } from "react";

interface Props {
  toolName: string;
  result: unknown;
}

export function ToolResult({ toolName, result }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const success = result && (result as { success?: boolean }).success !== false;

  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden text-[0.85rem]">
      <div 
        className="flex items-center gap-2 py-2 px-4 cursor-pointer select-none transition-colors hover:bg-bg-tertiary"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`text-[0.9rem] ${success ? "text-success" : "text-error"}`}>
          {success ? "✓" : "✗"}
        </span>
        <span className="font-mono text-xs text-text-muted">
          {toolName} result
        </span>
      </div>
      <pre 
        className={`m-0 p-4 font-mono text-xs text-text-muted bg-bg-primary border-t border-border overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words select-text ${
          collapsed ? "hidden" : ""
        }`}
      >
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
