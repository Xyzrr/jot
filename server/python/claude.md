# Python Executor

This module provides Python code execution capabilities for the AI assistant.

## Purpose

Allows the agent to execute arbitrary Python code with access to:

- **PostgreSQL Database**: Via `query()` and `execute()` functions
- **Cloudflare R2 Storage**: Via `upload_file()`, `download_file()`, `list_files()`, `delete_file()`

## Session Persistence

**Variables persist within a turn**: The Python executor maintains a persistent session throughout a single chat turn. Variables defined in one `execute_python` call are available in subsequent calls within the same turn. This works like a Jupyter notebook - state accumulates.

At the end of each turn, the session is cleaned up and a fresh session starts with the next turn.

## Available Functions in Python Environment

### Database

- `query(sql, params=None)` - Execute a SQL query, returns list of dicts
- `execute(sql, params=None)` - Execute INSERT/UPDATE/DELETE, returns affected rows

### R2 Storage

- `upload_file(key, data, content_type=None)` - Upload bytes or string to R2
- `download_file(key)` - Download file from R2, returns bytes
- `list_files(prefix='', max_keys=100)` - List files with optional prefix filter
- `delete_file(key)` - Delete a file from R2

### Embeddings (OpenAI)

- `embed(text)` - Generate 1536-dim embedding for a single text
- `embed_many(texts)` - Generate embeddings for multiple texts in batch (more efficient)

## Requirements

The Python environment needs these packages installed:

- `psycopg2-binary` - For PostgreSQL access
- `boto3` - For R2/S3 access
- `openai` - For embeddings

Optional but useful:

- `pandas` - For data analysis
- `numpy` - For numerical computations
- `matplotlib` - For visualizations (output as base64)

## Architecture

The executor uses a persistent Python subprocess:

1. On first `executePython()` call in a turn, a Python REPL process is spawned
2. Code is sent via stdin as JSON, results returned via stdout
3. The process maintains a global namespace (`_user_namespace`) that persists between executions
4. At the end of the chat turn, `endPythonSession()` is called to clean up

## Security

- Code runs in a subprocess with 30 second timeout per execution
- Environment variables for credentials are passed to the subprocess
- Temp files are cleaned up after the session ends
