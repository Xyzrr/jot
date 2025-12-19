// === State ===
const state = {
  messages: [],
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

// === Streaming Response ===
async function streamResponse() {
  // Create assistant message container
  const messageEl = document.createElement('div');
  messageEl.className = 'message assistant';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '◉';
  
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'message-content-wrapper';
  
  // Toggle bar for render/code view
  const toggleBar = document.createElement('div');
  toggleBar.className = 'ui-toggle-bar';
  toggleBar.innerHTML = `
    <button class="ui-toggle active" data-view="render">render</button>
    <button class="ui-toggle" data-view="code">code</button>
  `;
  contentWrapper.appendChild(toggleBar);
  
  // Render view - where HTML gets rendered
  const renderView = document.createElement('div');
  renderView.className = 'ui-view ui-render-view active';
  contentWrapper.appendChild(renderView);
  
  // Code view - raw text
  const codeView = document.createElement('div');
  codeView.className = 'ui-view ui-code-view';
  codeView.innerHTML = '<pre class="ui-code-pre"><code></code></pre>';
  contentWrapper.appendChild(codeView);
  
  // Tool calls container (inserted before toggle bar when tools are used)
  const toolsContainer = document.createElement('div');
  toolsContainer.className = 'tools-container';
  contentWrapper.insertBefore(toolsContainer, toggleBar);
  
  // Toggle handler
  toggleBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.ui-toggle');
    if (!btn) return;
    
    const view = btn.dataset.view;
    toggleBar.querySelectorAll('.ui-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    renderView.classList.toggle('active', view === 'render');
    codeView.classList.toggle('active', view === 'code');
  });
  
  messageEl.appendChild(avatar);
  messageEl.appendChild(contentWrapper);
  messagesContainer.appendChild(messageEl);

  let fullText = '';
  let isStreaming = true;
  contentWrapper.classList.add('streaming');

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
                // Update both views
                codeView.querySelector('code').textContent = fullText;
                renderHTML(renderView, fullText);
                break;

              case 'tool-call':
                renderToolCall(toolsContainer, event.toolName, event.args);
                break;

              case 'tool-result':
                renderToolResult(toolsContainer, event.toolName, event.result);
                break;

              case 'error':
                renderView.innerHTML = `<p class="error">Error: ${event.message}</p>`;
                break;

              case 'done':
                isStreaming = false;
                contentWrapper.classList.remove('streaming');
                if (fullText) {
                  state.messages.push({ role: 'assistant', content: fullText });
                }
                // Execute any scripts in the final HTML
                executeScripts(renderView);
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
    renderView.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    contentWrapper.classList.remove('streaming');
  }
}

function renderHTML(container, html) {
  // Render HTML but don't execute scripts yet (wait for done)
  // Extract and hold scripts
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Remove script tags from render (we'll execute them on done)
  tempDiv.querySelectorAll('script').forEach(s => s.remove());
  
  container.innerHTML = tempDiv.innerHTML;
  
  // Apply any style tags
  const styles = container.querySelectorAll('style');
  // Styles are automatically applied when in DOM
}

function executeScripts(container) {
  // Re-parse the original content and execute scripts
  // Scripts were stripped during streaming for safety
  const fullHTML = container.innerHTML;
  
  // Find script content in the original (we need to get it from state)
  const lastAssistant = state.messages.filter(m => m.role === 'assistant').pop();
  if (!lastAssistant) return;
  
  const scriptMatch = lastAssistant.content.match(/<script>([\s\S]*?)<\/script>/gi);
  if (scriptMatch) {
    scriptMatch.forEach(script => {
      const code = script.replace(/<\/?script>/gi, '');
      try {
        const fn = new Function('container', code);
        fn(container);
      } catch (e) {
        console.error('Script execution error:', e);
      }
    });
  }
}

function renderUserMessage(content) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message user';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '→';

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  contentEl.textContent = content; // Plain text for user messages

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
