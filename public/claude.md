# Frontend Module - Claude.md

## Overview

Vanilla HTML/CSS/JS frontend with real-time streaming UI. Shows tool calls, results, and generated UIs inline in the conversation.

## Files

### `index.html`

Page structure:

- Ambient gradient background
- Header with logo and connection status
- Chat message container
- Input area with voice button

### `styles.css`

Dark theme with:

- Tool call styling (purple accent)
- Tool result styling (green accent, collapsible)
- Inline UI container
- Streaming text blocks

### `app.js`

Frontend logic with streaming:

- SSE streaming from `/api/chat`
- Real-time event handling
- Tool call/result rendering
- Inline UI execution

## Streaming Architecture

### Event Types Handled

```javascript
switch (event.type) {
  case "text-delta": // Append to current text block
  case "tool-call": // Show tool invocation with args
  case "tool-result": // Show result (collapsed by default)
  case "ui": // Render HTML/CSS/JS inline
  case "error": // Show error message
  case "done": // Finalize response
}
```

### Message Structure

Assistant messages can contain multiple blocks:

```
┌─────────────────────────────────────┐
│ [Avatar] Message wrapper            │
│  ┌──────────────────────────────┐   │
│  │ Text block (streamed)        │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ ⚡ execute_sql (tool call)   │   │
│  │ {query: "SELECT..."}         │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ ✓ execute_sql result         │   │
│  │ (click to expand)            │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ Inline UI                    │   │
│  │ (rendered HTML/CSS/JS)       │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ More text...                 │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Tool Display

### Tool Calls

- Purple left border
- Shows tool name + args
- Click header to toggle args visibility
- Args shown as formatted JSON

### Tool Results

- Green left border
- Collapsed by default (just shows "✓ tool_name result")
- Click to expand and see full result
- Useful for debugging

## Inline UI Rendering

UIs are parsed from XML tags in the streamed text response:

```xml
<render_ui>
<html><div class="chart">...</div></html>
<css>.chart { ... }</css>
<js>container.querySelector('.btn').onclick = ...</js>
</render_ui>
```

The `createUIParser()` function:

1. Detects `<render_ui>` opening tag
2. Shows streaming placeholder with live preview
3. Accumulates content until `</render_ui>`
4. Extracts `<html>`, `<css>`, `<js>` sections
5. Renders final UI and executes JS

This allows UIs to stream naturally alongside text, with visual feedback during generation.

## Design System

### Colors

```css
--accent-primary: #ff6b35   /* Orange - user messages */
--accent-secondary: #ffc857 /* Yellow */
--accent-tertiary: #7b68ee  /* Purple - tool calls */
--success: #4ade80          /* Green - tool results */
```

### Fonts

- Sans: Outfit
- Mono: JetBrains Mono (for code, tool args)

## Voice Recording

Browser-based via MediaRecorder + Web Speech API:

1. Hold mic button
2. Release to stop
3. Transcribed via browser Speech Recognition
4. Inserted into input field

## Future Enhancements

- [ ] Whisper API for better transcription
- [ ] File upload UI
- [ ] Export conversation
- [ ] Keyboard shortcuts
