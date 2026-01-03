import { useRef, useEffect } from "react";
import { PythonHighlight } from "./PythonHighlight";

interface Props {
  partialArgs: string;
}

export function CodeStreaming({ partialArgs }: Props) {
  const codeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as code streams in
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, [partialArgs]);

  // Try to extract the code from the partial JSON args
  const extractCode = (partial: string): string => {
    const codeMatch = partial.match(/"code"\s*:\s*"([\s\S]*)/);
    if (codeMatch) {
      let code = codeMatch[1];
      if (code.endsWith('"}')) {
        code = code.slice(0, -2);
      } else if (code.endsWith('"')) {
        code = code.slice(0, -1);
      }
      try {
        const fullJson = '"' + code + '"';
        const parsed = JSON.parse(fullJson);
        return parsed;
      } catch {
        return code
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
    return partial;
  };

  const code = extractCode(partialArgs);
  const hasCode = code.trim().length > 0;

  return (
    <div className="tool-call-block">
      {/* Status header - consistent with ToolCall */}
      <div className="flex items-center gap-2 px-4 py-2 text-text-muted">
        <span className="flex items-center gap-2 text-[11px] tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-tertiary animate-breathe" />
          writing
        </span>
      </div>

      {/* Code content */}
      <div
        className="p-4 pt-0 select-text max-h-80 overflow-y-auto"
        ref={codeRef}
      >
        {hasCode ? (
          <PythonHighlight code={code} />
        ) : (
          <span className="font-mono text-[13px] text-text-muted">...</span>
        )}
      </div>
    </div>
  );
}
