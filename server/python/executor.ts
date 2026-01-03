import { spawn, ChildProcess } from "child_process";
import { config } from "../config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Python REPL server script - runs in a loop, executes code, returns results
const PYTHON_REPL_SCRIPT = `
import os
import json
import sys
import traceback
from io import StringIO

# Database connection (using psycopg2)
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    _db_conn = None
    def get_db():
        global _db_conn
        if _db_conn is None:
            _db_conn = psycopg2.connect(os.environ['DATABASE_URL'])
        return _db_conn
    
    def query(sql, params=None):
        """Execute a SQL query and return results as a list of dicts."""
        conn = get_db()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            if cur.description:
                return [dict(row) for row in cur.fetchall()]
            conn.commit()
            return {"affected_rows": cur.rowcount}
    
    def execute(sql, params=None):
        """Execute a SQL statement (INSERT, UPDATE, DELETE)."""
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
            return {"affected_rows": cur.rowcount}

except Exception as _db_err:
    _db_error_msg = f"Database not available: {_db_err}"
    def query(sql, params=None):
        raise RuntimeError(_db_error_msg)
    def execute(sql, params=None):
        raise RuntimeError(_db_error_msg)

# R2/S3 storage (using boto3)
try:
    print("[DEBUG] Starting R2 setup...", file=sys.stderr)
    import boto3
    print("[DEBUG] boto3 imported", file=sys.stderr)
    from botocore.config import Config
    print("[DEBUG] botocore.config imported", file=sys.stderr)
    
    _s3_client = None
    def get_s3():
        global _s3_client
        if _s3_client is None:
            _s3_client = boto3.client(
                's3',
                endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
                aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
                config=Config(signature_version='s3v4'),
                region_name='auto'
            )
        return _s3_client
    print("[DEBUG] get_s3 defined", file=sys.stderr)
    
    BUCKET = os.environ.get('R2_BUCKET_NAME', 'jot-storage')
    print(f"[DEBUG] BUCKET={BUCKET}", file=sys.stderr)
    
    def upload_file(key, data, content_type=None):
        """Upload data to R2. data can be bytes or string."""
        if isinstance(data, str):
            data = data.encode('utf-8')
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
        get_s3().put_object(Bucket=BUCKET, Key=key, Body=data, **extra_args)
        return {"success": True, "key": key}
    
    def download_file(key):
        """Download a file from R2, returns bytes."""
        response = get_s3().get_object(Bucket=BUCKET, Key=key)
        return response['Body'].read()
    
    def list_files(prefix='', max_keys=100):
        """List files in R2 with optional prefix."""
        response = get_s3().list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=max_keys)
        return [obj['Key'] for obj in response.get('Contents', [])]
    
    def delete_file(key):
        """Delete a file from R2."""
        get_s3().delete_object(Bucket=BUCKET, Key=key)
        return {"success": True}
    
    def get_upload_url(key, content_type, expires_in=3600):
        """Generate a presigned URL for uploading a file."""
        url = get_s3().generate_presigned_url(
            'put_object',
            Params={'Bucket': BUCKET, 'Key': key, 'ContentType': content_type},
            ExpiresIn=expires_in
        )
        return {"url": url, "key": key, "expires_in": expires_in}
    
    def get_download_url(key, expires_in=3600):
        """Generate a presigned URL for downloading a file."""
        url = get_s3().generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET, 'Key': key},
            ExpiresIn=expires_in
        )
        return {"url": url, "key": key, "expires_in": expires_in}
    print("[DEBUG] All R2 functions defined successfully", file=sys.stderr)

except Exception as _r2_err:
    print(f"[DEBUG] R2 setup FAILED: {_r2_err}", file=sys.stderr)
    _r2_error_msg = f"R2 storage not available: {_r2_err}"
    def upload_file(key, data, content_type=None):
        raise RuntimeError(_r2_error_msg)
    def download_file(key):
        raise RuntimeError(_r2_error_msg)
    def list_files(prefix='', max_keys=100):
        raise RuntimeError(_r2_error_msg)
    def delete_file(key):
        raise RuntimeError(_r2_error_msg)
    def get_upload_url(key, content_type, expires_in=3600):
        raise RuntimeError(_r2_error_msg)
    def get_download_url(key, expires_in=3600):
        raise RuntimeError(_r2_error_msg)

# OpenAI Embeddings
try:
    import openai
    
    _openai_client = None
    def get_openai():
        global _openai_client
        if _openai_client is None:
            api_key = os.environ.get('OPENAI_API_KEY')
            if not api_key:
                raise ValueError("OPENAI_API_KEY environment variable not set")
            _openai_client = openai.OpenAI(api_key=api_key)
        return _openai_client
    
    def embed(text, model="text-embedding-3-small"):
        """Generate embedding for a single text. Returns a list of 1536 floats."""
        response = get_openai().embeddings.create(input=text, model=model)
        return response.data[0].embedding
    
    def embed_many(texts, model="text-embedding-3-small"):
        """Generate embeddings for multiple texts. Returns list of embeddings in same order."""
        response = get_openai().embeddings.create(input=texts, model=model)
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [item.embedding for item in sorted_data]

except Exception as _openai_err:
    _openai_error_msg = f"OpenAI not available: {_openai_err}"
    def embed(text, model="text-embedding-3-small"):
        raise RuntimeError(_openai_error_msg)
    def embed_many(texts, model="text-embedding-3-small"):
        raise RuntimeError(_openai_error_msg)

# Global namespace for persistent variables
# Pre-populate with all helper functions so user code can access them
_user_namespace = {
    'query': query,
    'execute': execute,
    'upload_file': upload_file,
    'download_file': download_file,
    'list_files': list_files,
    'delete_file': delete_file,
    'get_upload_url': get_upload_url,
    'get_download_url': get_download_url,
    'embed': embed,
    'embed_many': embed_many,
}

# Marker for end of response
END_MARKER = "<<<END_OF_RESPONSE>>>"

def run_code(code):
    """Execute code in persistent namespace, capturing stdout/stderr."""
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = captured_stdout = StringIO()
    sys.stderr = captured_stderr = StringIO()
    
    success = True
    error = None
    
    try:
        # Execute in persistent namespace
        exec(code, _user_namespace)
    except Exception as e:
        success = False
        error = traceback.format_exc()
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
    
    stdout = captured_stdout.getvalue()
    stderr = captured_stderr.getvalue()
    
    return {
        "success": success,
        "output": stdout if stdout else None,
        "stderr": stderr if stderr else None,
        "error": error
    }

# Main REPL loop - read JSON commands from stdin, write JSON results to stdout
while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break
        
        request = json.loads(line.strip())
        code = request.get("code", "")
        
        result = run_code(code)
        
        # Write result as JSON followed by end marker
        print(json.dumps(result), flush=True)
        print(END_MARKER, flush=True)
        
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}), flush=True)
        print(END_MARKER, flush=True)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), flush=True)
        print(END_MARKER, flush=True)
`;

const END_MARKER = "<<<END_OF_RESPONSE>>>";

export interface PythonResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime?: number;
}

/**
 * Manages a persistent Python session that maintains state across executions.
 * Variables defined in one execution are available in subsequent executions.
 */
export class PythonSession {
  private process: ChildProcess | null = null;
  private tempFile: string | null = null;
  private buffer: string = "";
  private responsePromise: {
    resolve: (result: PythonResult) => void;
    startTime: number;
  } | null = null;

  constructor() {}

  private getEnv() {
    return {
      ...process.env,
      DATABASE_URL: config.databaseUrl,
      R2_ACCOUNT_ID: config.r2.accountId,
      R2_ACCESS_KEY_ID: config.r2.accessKeyId,
      R2_SECRET_ACCESS_KEY: config.r2.secretAccessKey,
      R2_BUCKET_NAME: config.r2.bucketName,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
      PYTHONUNBUFFERED: "1",
    };
  }

  private async ensureProcess(): Promise<void> {
    if (this.process && !this.process.killed) {
      return;
    }

    // Write the REPL script to a temp file
    const tempDir = os.tmpdir();
    this.tempFile = path.join(tempDir, `jot_python_repl_${Date.now()}.py`);
    await fs.promises.writeFile(this.tempFile, PYTHON_REPL_SCRIPT);

    this.process = spawn("python3", ["-u", this.tempFile], {
      env: this.getEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.buffer = "";

    this.process.stdout?.on("data", (data) => {
      this.buffer += data.toString();
      this.checkForResponse();
    });

    this.process.stderr?.on("data", (data) => {
      // Python warnings and such go to stderr
      console.error("[Python stderr]:", data.toString());
    });

    this.process.on("close", (code) => {
      if (this.responsePromise) {
        this.responsePromise.resolve({
          success: false,
          error: `Python process exited unexpectedly with code ${code}`,
          executionTime: Date.now() - this.responsePromise.startTime,
        });
        this.responsePromise = null;
      }
      this.process = null;
      // Clean up temp file
      if (this.tempFile) {
        fs.promises.unlink(this.tempFile).catch(() => {});
        this.tempFile = null;
      }
    });

    this.process.on("error", (err) => {
      if (this.responsePromise) {
        this.responsePromise.resolve({
          success: false,
          error: `Python process error: ${err.message}`,
          executionTime: Date.now() - this.responsePromise.startTime,
        });
        this.responsePromise = null;
      }
    });
  }

  private checkForResponse(): void {
    const markerIndex = this.buffer.indexOf(END_MARKER);
    if (markerIndex === -1) return;

    const responseText = this.buffer.substring(0, markerIndex).trim();
    this.buffer = this.buffer.substring(markerIndex + END_MARKER.length).trim();

    if (this.responsePromise) {
      const executionTime = Date.now() - this.responsePromise.startTime;
      try {
        const result = JSON.parse(responseText);

        // Format the output
        let output = result.output || "";
        if (result.stderr) {
          output += (output ? "\n" : "") + result.stderr;
        }

        this.responsePromise.resolve({
          success: result.success,
          output: output.trim() || "(no output)",
          error: result.error,
          executionTime,
        });
      } catch {
        this.responsePromise.resolve({
          success: false,
          error: `Failed to parse Python response: ${responseText}`,
          executionTime,
        });
      }
      this.responsePromise = null;
    }
  }

  async execute(code: string): Promise<PythonResult> {
    const startTime = Date.now();

    try {
      await this.ensureProcess();

      if (!this.process?.stdin) {
        return {
          success: false,
          error: "Failed to get Python process stdin",
          executionTime: Date.now() - startTime,
        };
      }

      return new Promise((resolve) => {
        // Set up timeout
        const timeout = setTimeout(() => {
          if (this.responsePromise) {
            this.responsePromise.resolve({
              success: false,
              error: "Execution timed out after 30 seconds",
              executionTime: 30000,
            });
            this.responsePromise = null;
            this.kill(); // Kill the process on timeout
          }
        }, 30000);

        this.responsePromise = {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          startTime,
        };

        // Send the code to the Python process
        const request = JSON.stringify({ code }) + "\n";
        this.process!.stdin!.write(request);
      });
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        error: `Failed to execute Python: ${error.message}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  kill(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
      this.process = null;
    }
    if (this.tempFile) {
      fs.promises.unlink(this.tempFile).catch(() => {});
      this.tempFile = null;
    }
  }
}

// Global session for the current request
// In a real app, you might want to manage sessions per user/request
let currentSession: PythonSession | null = null;

/**
 * Get or create a Python session.
 * Call this at the start of a chat turn to get a fresh session.
 */
export function getPythonSession(): PythonSession {
  if (!currentSession) {
    currentSession = new PythonSession();
  }
  return currentSession;
}

/**
 * End the current Python session.
 * Call this at the end of a chat turn to clean up.
 */
export function endPythonSession(): void {
  if (currentSession) {
    currentSession.kill();
    currentSession = null;
  }
}

/**
 * Execute Python code in the current session.
 * Variables persist across calls within the same session.
 */
export async function executePython(code: string): Promise<PythonResult> {
  const session = getPythonSession();
  return session.execute(code);
}
