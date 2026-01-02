import { useRef, useEffect } from "react";

interface Props {
  partialArgs: string;
}

export function CodeStreaming({ partialArgs }: Props) {
  const codeRef = useRef<HTMLPreElement>(null);

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

  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden text-[0.85rem]">
      <div className="flex items-center gap-2 py-2 px-4">
        <span className="text-[0.9rem] text-text-muted">🐍</span>
        <span className="font-mono text-xs text-text-muted flex-1">
          Generating Python code...
        </span>
        <span className="w-1 h-1 rounded-full bg-text-muted animate-breathe" />
      </div>
      <pre
        className="m-0 p-4 font-mono text-sm text-text-secondary bg-bg-primary border-t border-border overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed select-text"
        ref={codeRef}
      >
        <code className="bg-transparent p-0">{code}</code>
      </pre>
    </div>
  );
}
