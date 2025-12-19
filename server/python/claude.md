# Python Executor

This module provides Python code execution capabilities for the AI assistant.

## Purpose

Allows the agent to execute arbitrary Python code with access to:
- **PostgreSQL Database**: Via `query()` and `execute()` functions
- **Cloudflare R2 Storage**: Via `upload_file()`, `download_file()`, `list_files()`, `delete_file()`

## Available Functions in Python Environment

### Database
- `query(sql, params=None)` - Execute a SQL query, returns list of dicts
- `execute(sql, params=None)` - Execute INSERT/UPDATE/DELETE, returns affected rows

### R2 Storage
- `upload_file(key, data, content_type=None)` - Upload bytes or string to R2
- `download_file(key)` - Download file from R2, returns bytes
- `list_files(prefix='', max_keys=100)` - List files with optional prefix filter
- `delete_file(key)` - Delete a file from R2

## Requirements

The Python environment needs these packages installed:
- `psycopg2-binary` - For PostgreSQL access
- `boto3` - For R2/S3 access

Optional but useful:
- `pandas` - For data analysis
- `numpy` - For numerical computations
- `matplotlib` - For visualizations (output as base64)

## Security

- Code runs in a subprocess with 30 second timeout
- Environment variables for credentials are passed to the subprocess
- Temp files are cleaned up after execution

