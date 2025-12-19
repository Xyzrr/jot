// === State ===
const state = {
  messages: [], // Full conversation history
  isLoading: false,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
};

// === DOM Elements ===
const messagesContainer = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const voiceBtn = document.getElementById('voiceBtn');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

// === Initialization ===
async function init() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    if (data.status === 'ok') {
      statusDot.classList.add('connected');
      statusText.textContent = data.database === 'connected' ? 'ready' : 'db offline';
    }
  } catch (error) {
    statusText.textContent = 'offline';
  }

  input.addEventListener('input', handleInputChange);
  input.addEventListener('keydown', handleKeyDown);
  sendBtn.addEventListener('click', sendMessage);
  voiceBtn.addEventListener('mousedown', startRecording);
  voiceBtn.addEventListener('mouseup', stopRecording);
  voiceBtn.addEventListener('mouseleave', stopRecording);
  voiceBtn.addEventListener('touchstart', startRecording);
  voiceBtn.addEventListener('touchend', stopRecording);

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });
}

// === Input Handling ===
function handleInputChange() {
  sendBtn.disabled = input.value.trim() === '' || state.isLoading;
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
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

  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  const welcome = messagesContainer.querySelector('.welcome');
  if (welcome) welcome.remove();

  state.messages.push({ role: 'user', content });
  renderUserMessage(content);

  state.isLoading = true;
  await streamResponse();
  state.isLoading = false;
  handleInputChange();
}

// === Streaming Response with XML Tag Parsing ===
async function streamResponse() {
  const messageEl = document.createElement('div');
  messageEl.className = 'message assistant';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '◉';
  
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'message-content-wrapper';
  
  messageEl.appendChild(avatar);
  messageEl.appendChild(contentWrapper);
  messagesContainer.appendChild(messageEl);

  // Parser state
  const parser = createUIParser(contentWrapper);
  let fullText = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content }))
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (!data) continue;
          
          try {
            const event = JSON.parse(data);
            
            switch (event.type) {
              case 'text-delta':
                fullText += event.content;
                parser.push(event.content);
                break;

              case 'tool-call':
                parser.flush(); // Flush any pending text
                renderToolCall(contentWrapper, event.toolName, event.args);
                break;

              case 'tool-result':
                renderToolResult(contentWrapper, event.toolName, event.result);
                break;

              case 'error':
                parser.flush();
                renderError(contentWrapper, event.message);
                break;

              case 'done':
                parser.finish();
                if (fullText) {
                  state.messages.push({ role: 'assistant', content: fullText });
                }
                break;
            }
          } catch (e) {
            console.error('Failed to parse SSE:', data, e);
          }
        }
      }

      messageEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  } catch (error) {
    parser.flush();
    renderError(contentWrapper, error.message);
  }
}

// === UI Parser - Handles <render_ui> tags in streamed text ===
function createUIParser(container) {
  let textBuffer = '';
  let currentTextBlock = null;
  let uiBuffer = '';
  let inRenderUI = false;
  let currentUIElement = null;

  function flushTextBuffer() {
    if (textBuffer.trim()) {
      if (!currentTextBlock) {
        currentTextBlock = document.createElement('div');
        currentTextBlock.className = 'message-text';
        container.appendChild(currentTextBlock);
      }
      currentTextBlock.innerHTML = formatMarkdown(textBuffer);
    }
  }

  function createUIPlaceholder() {
    currentUIElement = document.createElement('div');
    currentUIElement.className = 'inline-ui streaming';
    currentUIElement.innerHTML = `
      <div class="inline-ui-header">
        <span class="ui-indicator">◉</span>
        <span class="ui-label">Rendering UI...</span>
      </div>
      <div class="inline-ui-preview"></div>
    `;
    container.appendChild(currentUIElement);
    currentTextBlock = null; // Reset text block after UI
  }

  function updateUIPreview() {
    if (!currentUIElement) return;
    const preview = currentUIElement.querySelector('.inline-ui-preview');
    // Show a preview of what's being generated
    const previewText = uiBuffer.length > 200 
      ? '...' + uiBuffer.slice(-200) 
      : uiBuffer;
    preview.textContent = previewText;
  }

  function finalizeUI() {
    if (!currentUIElement || !uiBuffer) return;

    // Parse the XML content
    const html = extractTag(uiBuffer, 'html');
    const css = extractTag(uiBuffer, 'css');
    const js = extractTag(uiBuffer, 'js');

    // Replace placeholder with actual UI
    currentUIElement.className = 'inline-ui';
    currentUIElement.innerHTML = '';

    if (css) {
      const styleEl = document.createElement('style');
      styleEl.textContent = css;
      currentUIElement.appendChild(styleEl);
    }

    const contentEl = document.createElement('div');
    contentEl.className = 'inline-ui-content';
    contentEl.innerHTML = html || '';
    currentUIElement.appendChild(contentEl);

    // Execute JS if provided
    if (js) {
      try {
        const fn = new Function('container', js);
        fn(contentEl);
      } catch (error) {
        console.error('Error executing UI script:', error);
      }
    }

    currentUIElement = null;
    uiBuffer = '';
  }

  function extractTag(content, tagName) {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }

  return {
    push(chunk) {
      for (const char of chunk) {
        if (inRenderUI) {
          uiBuffer += char;
          
          // Check for closing tag
          if (uiBuffer.endsWith('</render_ui>')) {
            uiBuffer = uiBuffer.slice(0, -12); // Remove closing tag
            finalizeUI();
            inRenderUI = false;
          } else {
            // Update preview periodically
            if (uiBuffer.length % 50 === 0) {
              updateUIPreview();
            }
          }
        } else {
          textBuffer += char;
          
          // Check for opening tag
          if (textBuffer.endsWith('<render_ui>')) {
            textBuffer = textBuffer.slice(0, -11); // Remove opening tag
            flushTextBuffer();
            textBuffer = '';
            inRenderUI = true;
            uiBuffer = '';
            createUIPlaceholder();
          }
        }
      }
      
      // Update text display
      if (!inRenderUI && textBuffer) {
        flushTextBuffer();
      }
    },

    flush() {
      flushTextBuffer();
    },

    finish() {
      if (inRenderUI) {
        // Incomplete UI block - finalize what we have
        finalizeUI();
      }
      flushTextBuffer();
    }
  };
}

function renderUserMessage(content) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message user';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '→';

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  contentEl.innerHTML = formatMarkdown(content);

  messageEl.appendChild(avatar);
  messageEl.appendChild(contentEl);
  messagesContainer.appendChild(messageEl);
  messageEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function renderToolCall(container, toolName, args) {
  const toolEl = document.createElement('div');
  toolEl.className = 'tool-call';
  
  const header = document.createElement('div');
  header.className = 'tool-call-header';
  header.innerHTML = `<span class="tool-icon">⚡</span><span class="tool-name">${toolName}</span>`;
  
  const argsEl = document.createElement('pre');
  argsEl.className = 'tool-call-args';
  argsEl.textContent = JSON.stringify(args, null, 2);
  
  header.onclick = () => argsEl.classList.toggle('collapsed');
  
  toolEl.appendChild(header);
  toolEl.appendChild(argsEl);
  container.appendChild(toolEl);
}

function renderToolResult(container, toolName, result) {
  const resultEl = document.createElement('div');
  resultEl.className = 'tool-result';
  
  const header = document.createElement('div');
  header.className = 'tool-result-header';
  const success = result && (result.success !== false);
  header.innerHTML = `<span class="result-icon">${success ? '✓' : '✗'}</span><span class="result-label">${toolName} result</span>`;
  
  const dataEl = document.createElement('pre');
  dataEl.className = 'tool-result-data collapsed';
  dataEl.textContent = JSON.stringify(result, null, 2);
  
  header.onclick = () => dataEl.classList.toggle('collapsed');
  
  resultEl.appendChild(header);
  resultEl.appendChild(dataEl);
  container.appendChild(resultEl);
}

function renderError(container, message) {
  const errorEl = document.createElement('div');
  errorEl.className = 'message-error';
  errorEl.textContent = `Error: ${message}`;
  container.appendChild(errorEl);
}

function formatMarkdown(text) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
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
      const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
      await processVoiceInput(audioBlob);
      stream.getTracks().forEach((track) => track.stop());
    };

    state.mediaRecorder.start();
    state.isRecording = true;
    voiceBtn.classList.add('recording');
  } catch (error) {
    console.error('Failed to start recording:', error);
    alert('Could not access microphone. Please check permissions.');
  }
}

function stopRecording(e) {
  e.preventDefault();
  if (!state.isRecording || !state.mediaRecorder) return;

  state.mediaRecorder.stop();
  state.isRecording = false;
  voiceBtn.classList.remove('recording');
}

async function processVoiceInput(audioBlob) {
  useBrowserSpeechRecognition();
}

function useBrowserSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Speech recognition not supported in this browser. Try Chrome.');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    handleInputChange();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
  };

  recognition.start();
}

// === Start the app ===
init();
