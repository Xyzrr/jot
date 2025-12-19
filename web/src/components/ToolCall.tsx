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
    <div className={`tool-call ${isPython ? "tool-call-python" : ""}`}>
      <div className="tool-call-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="tool-icon">{isPython ? "🐍" : "⚡"}</span>
        <span className="tool-name">{isPython ? "Python" : toolName}</span>
        {isPython && <span className="tool-status">executing...</span>}
      </div>
      <pre className={`tool-call-args ${collapsed ? "collapsed" : ""}`}>
        {pythonCode ?? JSON.stringify(args, null, 2)}
      </pre>
    </div>
  );
}

