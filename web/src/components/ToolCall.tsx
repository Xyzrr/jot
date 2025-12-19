import { useState } from "react";

interface Props {
  toolName: string;
  args: unknown;
}

export function ToolCall({ toolName, args }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="tool-call">
      <div className="tool-call-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="tool-icon">⚡</span>
        <span className="tool-name">{toolName}</span>
      </div>
      <pre className={`tool-call-args ${collapsed ? "collapsed" : ""}`}>
        {JSON.stringify(args, null, 2)}
      </pre>
    </div>
  );
}

