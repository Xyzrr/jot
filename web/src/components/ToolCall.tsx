import { PythonHighlight } from "./PythonHighlight";

interface Props {
  toolName: string;
  args: unknown;
  hasResult?: boolean;
}

export function ToolCall({ toolName, args, hasResult }: Props) {
  const isPython = toolName === "execute_python";
  const isScratchpad = toolName === "update_scratchpad";

  const code = isPython
    ? (args as { code?: string })?.code || ""
    : isScratchpad
      ? (args as { content?: string })?.content || ""
      : JSON.stringify(args, null, 2);

  // Determine status
  const getStatus = () => {
    if (isPython) {
      return hasResult ? null : { label: "running", color: "bg-accent-secondary" };
    }
    if (isScratchpad) {
      return hasResult ? null : { label: "saving", color: "bg-accent-tertiary" };
    }
    return hasResult 
      ? null 
      : { label: toolName, color: "bg-text-muted" };
  };

  const status = getStatus();

  return (
    <div className={`tool-call-block ${hasResult ? "has-result" : ""}`}>
      {/* Status header */}
      {status && (
        <div className="flex items-center gap-2 px-4 py-2 text-text-muted">
          <span className="flex items-center gap-2 text-[11px] tracking-wide uppercase">
            <span className={`w-1.5 h-1.5 rounded-full ${status.color} animate-breathe`} />
            {status.label}
          </span>
        </div>
      )}

      {/* Code content */}
      <div className={`px-4 pb-4 select-text ${!status ? "pt-4" : ""}`}>
        {isPython ? (
          <PythonHighlight code={code} />
        ) : (
          <pre className="m-0 font-mono text-[13px] leading-[1.6] text-text-secondary whitespace-pre-wrap">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}
