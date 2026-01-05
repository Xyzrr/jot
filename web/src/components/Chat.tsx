import {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  type FormEvent,
  type KeyboardEvent,
  type WheelEvent,
  type DragEvent,
  type ChangeEvent,
} from "react";
import {
  useChat,
  type MessageWithId,
  type UploadedFile,
} from "../hooks/useChat";
import { AssistantMessage } from "./Message";

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Get icon for file type
function getFileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type.startsWith("video/")) return "🎬";
  if (type.startsWith("audio/")) return "🎵";
  if (type === "application/pdf") return "📄";
  if (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type === "text/csv"
  )
    return "📊";
  if (type.includes("document") || type.includes("word")) return "📝";
  if (type.includes("presentation") || type.includes("powerpoint")) return "📽️";
  if (
    type.includes("zip") ||
    type.includes("tar") ||
    type.includes("compressed")
  )
    return "📦";
  if (type.startsWith("text/") || type.includes("json") || type.includes("xml"))
    return "📃";
  return "📎";
}

// File preview component
function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (isImage) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, isImage]);

  return (
    <div className="relative group flex items-center gap-2 bg-bg-tertiary rounded-md px-2 py-1.5 text-sm animate-fade-in">
      {isImage && preview ? (
        <img
          src={preview}
          alt={file.name}
          className="w-8 h-8 object-cover rounded"
        />
      ) : (
        <span className="text-lg">{getFileIcon(file.type)}</span>
      )}
      <div className="flex flex-col min-w-0 max-w-[120px]">
        <span className="text-text-primary truncate text-xs">{file.name}</span>
        <span className="text-text-muted text-[10px]">
          {formatFileSize(file.size)}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-muted hover:text-error hover:border-error transition-colors opacity-0 group-hover:opacity-100"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="w-3 h-3"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// Isolated input component - typing here doesn't re-render messages
function ChatInput({
  onSend,
  onStop,
  isLoading,
  isUploading,
}: {
  onSend: (content: string, files?: File[]) => void;
  onStop: () => void;
  isLoading: boolean;
  isUploading: boolean;
}) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && files.length === 0) || isLoading || isUploading)
      return;
    onSend(input.trim(), files.length > 0 ? files : undefined);
    setInput("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
      textareaRef.current.style.overflowY =
        textareaRef.current.scrollHeight > 150 ? "auto" : "hidden";
    }
  };

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    setFiles((prev) => {
      // Avoid duplicates by name+size
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const unique = fileArray.filter(
        (f) => !existing.has(`${f.name}-${f.size}`)
      );
      return [...prev, ...unique];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Drag and drop handlers
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = ""; // Reset input
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // Handle paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }

      if (pastedFiles.length > 0) {
        addFiles(pastedFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addFiles]);

  const isBusy = isLoading || isUploading;
  const canSend = (input.trim() || files.length > 0) && !isBusy;

  return (
    <footer
      className="py-6 px-10 pb-[calc(--spacing(10)+env(safe-area-inset-bottom))] relative z-10"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Drop zone overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent-primary/10 border-2 border-dashed border-accent-primary rounded-lg flex items-center justify-center z-20 pointer-events-none animate-fade-in">
          <div className="text-accent-primary font-medium flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-6 h-6"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Drop files here
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 bg-bg-secondary border border-border rounded-lg p-1 transition-colors focus-within:border-border-focus">
        {/* File previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pt-2">
            {files.map((file, index) => (
              <FilePreview
                key={`${file.name}-${file.size}-${index}`}
                file={file}
                onRemove={() => removeFile(index)}
              />
            ))}
          </div>
        )}

        <form className="flex items-end gap-2" onSubmit={handleSubmit}>
          {/* Attach button */}
          <button
            type="button"
            onClick={openFilePicker}
            disabled={isBusy}
            className="w-9 h-9 mb-0.5 rounded border-none cursor-pointer flex items-center justify-center transition-all bg-transparent text-text-muted disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:text-text-primary"
            title="Attach files"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-[18px] h-[18px]"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={files.length > 0 ? "Add a message..." : "..."}
            rows={1}
            autoFocus
            disabled={isBusy}
            className="flex-1 bg-transparent border-none text-text-primary font-sans text-base py-2 px-2 resize-none max-h-[150px] leading-relaxed tracking-tight select-text focus:outline-none placeholder:text-text-muted overflow-hidden disabled:opacity-50"
          />

          {isBusy ? (
            isUploading ? (
              <div className="w-9 h-9 mb-0.5 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-text-muted animate-spin"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
            ) : (
              <button
                type="button"
                onClick={onStop}
                className="w-9 h-9 mb-0.5 rounded border-none cursor-pointer flex items-center justify-center transition-all bg-transparent text-text-muted hover:text-error"
                title="Stop generating"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            )
          ) : (
            <button
              type="submit"
              className="w-9 h-9 mb-0.5 rounded border-none cursor-pointer flex items-center justify-center transition-all bg-transparent text-text-muted disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:text-text-primary"
              disabled={!canSend}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-[18px] h-[18px]"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </form>
      </div>
      <div className="text-center mt-4 text-[0.7rem] text-text-muted opacity-60 tracking-wide max-sm:hidden">
        <kbd className="font-mono text-[0.65rem]">Enter</kbd> to send ·{" "}
        <kbd className="font-mono text-[0.65rem]">Shift+Enter</kbd> for new line
        · Drag & drop or paste files
      </div>
    </footer>
  );
}

// Attached file display in user message
function AttachedFileDisplay({ file }: { file: UploadedFile }) {
  const isImage = file.type.startsWith("image/");

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-bg-elevated/50 rounded px-2 py-1.5 text-xs hover:bg-bg-elevated transition-colors group"
    >
      {isImage ? (
        <img
          src={file.url}
          alt={file.name}
          className="w-10 h-10 object-cover rounded"
        />
      ) : (
        <span className="text-base">{getFileIcon(file.type)}</span>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-text-primary truncate max-w-[150px] group-hover:text-accent-primary transition-colors">
          {file.name}
        </span>
        <span className="text-text-muted text-[10px]">
          {formatFileSize(file.size)}
        </span>
      </div>
    </a>
  );
}

// Memoized user message - never re-renders once created
const UserMessage = memo(function UserMessage({
  content,
  files,
}: {
  content: string;
  files?: UploadedFile[];
}) {
  // Filter out the file info lines from content for cleaner display
  const displayContent = content
    .split("\n")
    .filter((line) => !line.startsWith("[Attached file:"))
    .join("\n")
    .trim();

  return (
    <div className="self-end max-w-[85%] flex flex-col gap-2 ml-auto animate-fade-in">
      {files && files.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-end">
          {files.map((file) => (
            <AttachedFileDisplay key={file.key} file={file} />
          ))}
        </div>
      )}
      {displayContent && (
        <div className="py-2 px-4 bg-bg-tertiary text-text-primary rounded-lg text-[0.95rem] select-text whitespace-pre-wrap">
          {displayContent}
        </div>
      )}
    </div>
  );
});

// Memoized assistant message wrapper
const MemoizedAssistantMessage = memo(function MemoizedAssistantMessage({
  message,
  toolResults,
}: {
  message: Extract<MessageWithId["message"], { role: "assistant" }>;
  toolResults: Map<string, { toolName: string; result: unknown }>;
}) {
  return <AssistantMessage message={message} toolResults={toolResults} />;
});

// Historical messages only - no streaming props means no re-render during streaming
const HistoricalMessages = memo(function HistoricalMessages({
  messages,
}: {
  messages: MessageWithId[];
}) {
  // Build tool results map from messages
  const toolResultsMap = new Map<
    string,
    { toolName: string; result: unknown }
  >();
  for (const msg of messages) {
    if (msg.message.role === "tool") {
      for (const part of msg.message.content) {
        if (part.type === "tool-result") {
          toolResultsMap.set(part.toolCallId, {
            toolName: part.toolName,
            result: part.output,
          });
        }
      }
    }
  }

  return (
    <>
      {messages.map((m) => {
        if (m.message.role === "user") {
          const content =
            typeof m.message.content === "string"
              ? m.message.content
              : m.message.content
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("");
          return <UserMessage key={m.id} content={content} files={m.files} />;
        }
        if (m.message.role === "assistant") {
          return (
            <MemoizedAssistantMessage
              key={m.id}
              message={
                m.message as Extract<typeof m.message, { role: "assistant" }>
              }
              toolResults={toolResultsMap}
            />
          );
        }
        return null; // tool messages rendered with their assistant
      })}
    </>
  );
});

export function Chat() {
  const {
    messages,
    isLoading,
    isUploading,
    sendMessage,
    stopGeneration,
    streamingBlocks,
    partialToolArgs,
    isStreamingToolCall,
    currentAssistantId,
  } = useChat();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoscroll = useRef(true);

  const isAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 50;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold
    );
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const atBottom = isAtBottom();
      if (e.deltaY < 0) {
        shouldAutoscroll.current = false;
      } else if (atBottom) {
        shouldAutoscroll.current = true;
      }
    },
    [isAtBottom]
  );

  // Autoscroll when messages change or streaming content updates
  useEffect(() => {
    if (shouldAutoscroll.current) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [messages, streamingBlocks]);

  const hasStreamingContent =
    currentAssistantId && (streamingBlocks.length > 0 || isStreamingToolCall);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main
        className="flex-1 overflow-y-auto p-10 relative z-1 overscroll-contain"
        ref={messagesContainerRef}
        onWheel={handleWheel}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col gap-10">
          {messages.length === 0 && !isLoading && (
            <div className="py-16">
              <h1 className="text-2xl font-light text-text-secondary mb-4 tracking-tight">
                tell me anything
              </h1>
            </div>
          )}

          {/* Historical messages - memoized, won't re-render during streaming */}
          <HistoricalMessages messages={messages} />

          {/* Streaming message - renders separately, doesn't affect historical */}
          {hasStreamingContent && currentAssistantId && (
            <AssistantMessage
              key={currentAssistantId}
              streaming={{
                blocks: streamingBlocks,
                partialToolArgs,
                isStreamingToolCall,
              }}
            />
          )}

          {isLoading && !hasStreamingContent && (
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full opacity-0 animate-breathe" />
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>
      <ChatInput
        onSend={sendMessage}
        onStop={stopGeneration}
        isLoading={isLoading}
        isUploading={isUploading}
      />
    </div>
  );
}
