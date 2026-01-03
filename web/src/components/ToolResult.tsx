import { useState } from "react";

interface Props {
  toolName: string;
  result: unknown;
}

export function ToolResult({ toolName, result }: Props) {
  const [expanded, setExpanded] = useState(true);
  const isPython = toolName === "execute_python";

  const resultObj = result as {
    success?: boolean;
    output?: string;
    error?: string;
    images?: string[];
  };

  const success = resultObj?.success !== false;
  const output = resultObj?.output || "";
  const error = resultObj?.error || "";
  const images = resultObj?.images || [];
  const hasOutput = output || error || images.length > 0;

  const statusLabel = success ? "done" : "error";
  const statusColor = success ? "bg-success" : "bg-error";

  return (
    <div className="tool-result-block">
      {/* Status header - consistent style */}
      <div
        className={`flex items-center gap-2 px-4 py-2 text-text-muted ${
          hasOutput ? "cursor-pointer select-none hover:bg-bg-tertiary" : ""
        }`}
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2 text-[11px] tracking-wide uppercase">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          {isPython ? statusLabel : `${toolName} ${statusLabel}`}
        </span>
        {hasOutput && (
          <span className="ml-auto text-[10px] text-text-muted opacity-50">
            {expanded ? "−" : "+"}
          </span>
        )}
      </div>

      {/* Output content */}
      {expanded && hasOutput && (
        <div className="px-4 pb-4 select-text">
          {error && (
            <pre className="m-0 font-mono text-[12px] leading-[1.5] text-error whitespace-pre-wrap">
              {error}
            </pre>
          )}
          {output && (
            <pre className="m-0 font-mono text-[12px] leading-[1.5] text-text-secondary whitespace-pre-wrap">
              {output}
            </pre>
          )}
          {images.map((img, i) => (
            <img
              key={i}
              src={img}
              alt="Output"
              className="max-w-full rounded mt-2"
            />
          ))}
        </div>
      )}
    </div>
  );
}
