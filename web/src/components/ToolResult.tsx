import { useState } from "react";

interface Props {
  toolName: string;
  result: unknown;
}

export function ToolResult({ toolName, result }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const success = result && (result as { success?: boolean }).success !== false;

  return (
    <div className="tool-result">
      <div className="tool-result-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="result-icon">{success ? "✓" : "✗"}</span>
        <span className="result-label">{toolName} result</span>
      </div>
      <pre className={`tool-result-data ${collapsed ? "collapsed" : ""}`}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

