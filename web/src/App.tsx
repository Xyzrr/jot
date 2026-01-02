import { useEffect, useState } from "react";
import { Chat } from "./components/Chat";
import "./index.css";

function App() {
  const [status, setStatus] = useState<"connecting" | "ready" | "offline">("connecting");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "ok") {
          setStatus(data.database === "connected" ? "ready" : "ready");
        }
      })
      .catch(() => setStatus("offline"));
  }, []);

  return (
    <div className="flex flex-col h-dvh max-w-[720px] mx-auto relative pt-[env(safe-area-inset-top)] px-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Ambient background */}
      <div 
        className="fixed inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 255, 255, 0.015) 0%, transparent 50%)' }}
      />

      <header className="flex justify-between items-center py-6 px-10 relative z-10 after:content-[''] after:absolute after:bottom-0 after:left-10 after:right-10 after:h-px after:bg-border">
        <div className="flex items-center gap-2">
          <span className="text-[0.5rem] text-accent-primary opacity-80">●</span>
          <span className="text-base font-normal tracking-widest lowercase text-text-secondary">jot</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted tracking-wide">
          <span 
            className={`w-[5px] h-[5px] rounded-full ${
              status === "ready" 
                ? "bg-success opacity-100" 
                : "bg-text-muted opacity-50"
            }`} 
          />
        </div>
      </header>

      <Chat />
    </div>
  );
}

export default App;
