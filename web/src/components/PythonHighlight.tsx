import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Props {
  code: string;
  className?: string;
}

export function PythonHighlight({ code, className = "" }: Props) {
  return (
    <SyntaxHighlighter
      language="python"
      style={vscDarkPlus}
      className={className}
      customStyle={{
        background: "transparent",
        margin: 0,
        padding: 0,
        fontSize: "13px",
        lineHeight: "1.6",
        overflowX: "auto",
        overflowY: "visible",
      }}
      codeTagProps={{
        style: {
          background: "transparent",
          fontSize: "13px",
          lineHeight: "1.6",
          fontFamily: "var(--font-mono)",
        },
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
