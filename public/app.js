// === State ===
const state = {
  messages: [],
  isLoading: false,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
};

// === DOM Elements ===
const messagesContainer = document.getElementById("messages");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const statusDot = document.querySelector(".status-dot");
const statusText = document.querySelector(".status-text");

// === Initialization ===
async function init() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.status === "ok") {
      statusDot.classList.add("connected");
      statusText.textContent =
        data.database === "connected" ? "ready" : "db offline";
    }
  } catch (error) {
    statusText.textContent = "offline";
  }

  input.addEventListener("input", handleInputChange);
  input.addEventListener("keydown", handleKeyDown);
  sendBtn.addEventListener("click", sendMessage);
  voiceBtn.addEventListener("mousedown", startRecording);
  voiceBtn.addEventListener("mouseup", stopRecording);
  voiceBtn.addEventListener("mouseleave", stopRecording);
  voiceBtn.addEventListener("touchstart", startRecording);
  voiceBtn.addEventListener("touchend", stopRecording);

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  });
}

// === Input Handling ===
function handleInputChange() {
  sendBtn.disabled = input.value.trim() === "" || state.isLoading;
}

function handleKeyDown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) {
      sendMessage();
    }
  }
}

// === Message Handling ===
async function sendMessage() {
  const content = input.value.trim();
  if (!content || state.isLoading) return;

  input.value = "";
  input.style.height = "auto";
  sendBtn.disabled = true;

  const welcome = messagesContainer.querySelector(".welcome");
  if (welcome) welcome.remove();

  state.messages.push({ role: "user", content });
  renderUserMessage(content);

  state.isLoading = true;
  await streamResponse();
  state.isLoading = false;
  handleInputChange();
}

// === Streaming Response ===
async function streamResponse() {
  // Create assistant message container
  const messageEl = document.createElement("div");
  messageEl.className = "message assistant";

  // Content container - elements added in stream order
  const contentArea = document.createElement("div");
  contentArea.className = "assistant-content-area";
  messageEl.appendChild(contentArea);

  // Current text block (created on first text, recreated after tool calls)
  let currentTextBlock = null;
  let currentBlockText = ""; // Text for current block only

  function getOrCreateTextBlock() {
    if (!currentTextBlock) {
      currentTextBlock = document.createElement("div");
      currentTextBlock.className = "assistant-content";
      contentArea.appendChild(currentTextBlock);
      currentBlockText = "";
    }
    return currentTextBlock;
  }

  function resetTextBlock() {
    currentTextBlock = null;
    currentBlockText = "";
  }

  // Code view - hidden by default
  const codeView = document.createElement("div");
  codeView.className = "assistant-code";
  codeView.innerHTML = "<pre><code></code></pre>";
  messageEl.appendChild(codeView);

  // Action bar with icon buttons
  const actionBar = document.createElement("div");
  actionBar.className = "message-actions";
  actionBar.innerHTML = `
    <button class="action-btn" data-action="code" title="View code">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
    </button>
    <button class="action-btn" data-action="copy" title="Copy">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  `;
  messageEl.appendChild(actionBar);

  // Action handlers
  actionBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".action-btn");
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === "code") {
      codeView.classList.toggle("active");
      btn.classList.toggle("active");
    } else if (action === "copy") {
      navigator.clipboard.writeText(fullText).then(() => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1500);
      });
    }
  });

  messagesContainer.appendChild(messageEl);

  let fullText = "";
  messageEl.classList.add("streaming");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: state.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (!data) continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case "text-delta":
                fullText += event.content;
                currentBlockText += event.content;
                // Update code view with full raw content
                codeView.querySelector("code").textContent = fullText;
                // Update current text block with its portion
                renderHTML(getOrCreateTextBlock(), currentBlockText);
                break;

              case "tool-call":
                // Tool calls appear in stream order - after any preceding text
                resetTextBlock(); // Next text gets new block
                renderToolCall(contentArea, event.toolName, event.args);
                break;

              case "tool-result":
                renderToolResult(contentArea, event.toolName, event.result);
                break;

              case "error":
                getOrCreateTextBlock().innerHTML = `<p class="error">Error: ${event.message}</p>`;
                break;

              case "done":
                messageEl.classList.remove("streaming");
                if (fullText) {
                  state.messages.push({ role: "assistant", content: fullText });
                }
                // Execute any scripts in the final HTML
                executeScripts(contentArea);
                break;
            }
          } catch (e) {
            console.error("Failed to parse SSE:", data, e);
          }
        }
      }

      messageEl.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  } catch (error) {
    getOrCreateTextBlock().innerHTML = `<p class="error">Error: ${error.message}</p>`;
    messageEl.classList.remove("streaming");
  }
}

function renderHTML(container, html) {
  // Render HTML but don't execute scripts yet (wait for done)
  // Extract and hold scripts
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // Remove script tags from render (we'll execute them on done)
  tempDiv.querySelectorAll("script").forEach((s) => s.remove());

  container.innerHTML = tempDiv.innerHTML;

  // Apply any style tags
  const styles = container.querySelectorAll("style");
  // Styles are automatically applied when in DOM
}

function executeScripts(container) {
  // Re-parse the original content and execute scripts
  // Scripts were stripped during streaming for safety
  const fullHTML = container.innerHTML;

  // Find script content in the original (we need to get it from state)
  const lastAssistant = state.messages
    .filter((m) => m.role === "assistant")
    .pop();
  if (!lastAssistant) return;

  const scriptMatch = lastAssistant.content.match(
    /<script>([\s\S]*?)<\/script>/gi
  );
  if (scriptMatch) {
    scriptMatch.forEach((script) => {
      const code = script.replace(/<\/?script>/gi, "");
      try {
        const fn = new Function("container", code);
        fn(container);
      } catch (e) {
        console.error("Script execution error:", e);
      }
    });
  }
}

function renderUserMessage(content) {
  const messageEl = document.createElement("div");
  messageEl.className = "message user";
  messageEl.textContent = content;
  messagesContainer.appendChild(messageEl);
  messageEl.scrollIntoView({ behavior: "smooth", block: "end" });
}

function renderToolCall(container, toolName, args) {
  const toolEl = document.createElement("div");
  toolEl.className = "tool-call";

  const header = document.createElement("div");
  header.className = "tool-call-header";
  header.innerHTML = `<span class="tool-icon">⚡</span><span class="tool-name">${toolName}</span>`;

  const argsEl = document.createElement("pre");
  argsEl.className = "tool-call-args";
  argsEl.textContent = JSON.stringify(args, null, 2);

  header.onclick = () => argsEl.classList.toggle("collapsed");

  toolEl.appendChild(header);
  toolEl.appendChild(argsEl);
  container.appendChild(toolEl);
}

function renderToolResult(container, toolName, result) {
  const resultEl = document.createElement("div");
  resultEl.className = "tool-result";

  const header = document.createElement("div");
  header.className = "tool-result-header";
  const success = result && result.success !== false;
  header.innerHTML = `<span class="result-icon">${
    success ? "✓" : "✗"
  }</span><span class="result-label">${toolName} result</span>`;

  const dataEl = document.createElement("pre");
  dataEl.className = "tool-result-data collapsed";
  dataEl.textContent = JSON.stringify(result, null, 2);

  header.onclick = () => dataEl.classList.toggle("collapsed");

  resultEl.appendChild(header);
  resultEl.appendChild(dataEl);
  container.appendChild(resultEl);
}

// === Voice Recording ===
async function startRecording(e) {
  e.preventDefault();
  if (state.isRecording) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.audioChunks = [];

    state.mediaRecorder.ondataavailable = (event) => {
      state.audioChunks.push(event.data);
    };

    state.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(state.audioChunks, { type: "audio/webm" });
      await processVoiceInput(audioBlob);
      stream.getTracks().forEach((track) => track.stop());
    };

    state.mediaRecorder.start();
    state.isRecording = true;
    voiceBtn.classList.add("recording");
  } catch (error) {
    console.error("Failed to start recording:", error);
    alert("Could not access microphone. Please check permissions.");
  }
}

function stopRecording(e) {
  e.preventDefault();
  if (!state.isRecording || !state.mediaRecorder) return;

  state.mediaRecorder.stop();
  state.isRecording = false;
  voiceBtn.classList.remove("recording");
}

async function processVoiceInput(audioBlob) {
  useBrowserSpeechRecognition();
}

function useBrowserSpeechRecognition() {
  if (
    !("webkitSpeechRecognition" in window) &&
    !("SpeechRecognition" in window)
  ) {
    alert("Speech recognition not supported in this browser. Try Chrome.");
    return;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    handleInputChange();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };

  recognition.start();
}

// === Start the app ===
init();
