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
  // The args will be building up like: {"code": "print('hello...
  const extractCode = (partial: string): string => {
    // Try to find the code field value
    const codeMatch = partial.match(/"code"\s*:\s*"([\s\S]*)/);
    if (codeMatch) {
      let code = codeMatch[1];
      // If it ends with a quote and closing brace, strip them
      if (code.endsWith('"}')) {
        code = code.slice(0, -2);
      } else if (code.endsWith('"')) {
        code = code.slice(0, -1);
      }
      // Unescape JSON string escapes
      try {
        // Add quotes back to make it a valid JSON string for parsing
        const fullJson = '"' + code + '"';
        // Handle incomplete escape sequences by padding if needed
        const parsed = JSON.parse(fullJson);
        return parsed;
      } catch {
        // If parsing fails, do basic unescaping
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
    <div className="code-streaming">
      <div className="code-streaming-header">
        <span className="code-icon">🐍</span>
        <span className="code-label">Generating Python code...</span>
        <span className="streaming-indicator"></span>
      </div>
      <pre className="code-streaming-content" ref={codeRef}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
