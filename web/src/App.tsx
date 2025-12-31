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
    <div className="app">
      <div className="ambient-bg" />

      <header className="header">
        <div className="logo">
          <span className="logo-icon">●</span>
          <span className="logo-text">jot</span>
        </div>
        <div className="status">
          <span className={`status-dot ${status === "ready" ? "connected" : ""}`} />
        </div>
      </header>

      <Chat />
    </div>
  );
}

export default App;
