import { spawn } from "child_process";
import { config } from "../config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Python script template that provides access to DB and R2
const PYTHON_PREAMBLE = `
import os
import json
import sys

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

except ImportError:
    def query(sql, params=None):
        raise ImportError("psycopg2 not installed. Run: pip install psycopg2-binary")
    def execute(sql, params=None):
        raise ImportError("psycopg2 not installed. Run: pip install psycopg2-binary")

# R2/S3 storage (using boto3)
try:
    import boto3
    from botocore.config import Config
    
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
    
    BUCKET = os.environ.get('R2_BUCKET_NAME', 'jot-storage')
    
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

except ImportError:
    def upload_file(key, data, content_type=None):
        raise ImportError("boto3 not installed. Run: pip install boto3")
    def download_file(key):
        raise ImportError("boto3 not installed. Run: pip install boto3")
    def list_files(prefix='', max_keys=100):
        raise ImportError("boto3 not installed. Run: pip install boto3")
    def delete_file(key):
        raise ImportError("boto3 not installed. Run: pip install boto3")

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
        # Sort by index to maintain order
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [item.embedding for item in sorted_data]

except ImportError:
    def embed(text, model="text-embedding-3-small"):
        raise ImportError("openai not installed. Run: pip install openai")
    def embed_many(texts, model="text-embedding-3-small"):
        raise ImportError("openai not installed. Run: pip install openai")

# Helper to format output for the agent
def _format_result(result):
    """Format Python objects for JSON output."""
    if hasattr(result, '__iter__') and not isinstance(result, (str, bytes, dict)):
        result = list(result)
    return json.dumps(result, default=str, indent=2)

`;

export interface PythonResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime?: number;
}

export async function executePython(code: string): Promise<PythonResult> {
  const startTime = Date.now();

  // Create a temporary file with the code
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `jot_python_${Date.now()}.py`);

  // Wrap user code to capture the result of the last expression
  const wrappedCode = `
${PYTHON_PREAMBLE}

# User code
_result = None
try:
${code
  .split("\n")
  .map((line) => "    " + line)
  .join("\n")}
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;

  try {
    await fs.promises.writeFile(tempFile, wrappedCode);

    return new Promise((resolve) => {
      const env = {
        ...process.env,
        DATABASE_URL: config.databaseUrl,
        R2_ACCOUNT_ID: config.r2.accountId,
        R2_ACCESS_KEY_ID: config.r2.accessKeyId,
        R2_SECRET_ACCESS_KEY: config.r2.secretAccessKey,
        R2_BUCKET_NAME: config.r2.bucketName,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
        PYTHONUNBUFFERED: "1",
      };

      const pythonProcess = spawn("python3", [tempFile], {
        env,
        timeout: 30000, // 30 second timeout
      });

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      pythonProcess.on("close", (exitCode) => {
        // Clean up temp file
        fs.promises.unlink(tempFile).catch(() => {});

        const executionTime = Date.now() - startTime;

        if (exitCode === 0) {
          resolve({
            success: true,
            output: stdout.trim() || "(no output)",
            executionTime,
          });
        } else {
          resolve({
            success: false,
            error: stderr.trim() || `Process exited with code ${exitCode}`,
            output: stdout.trim() || undefined,
            executionTime,
          });
        }
      });

      pythonProcess.on("error", (err) => {
        fs.promises.unlink(tempFile).catch(() => {});
        resolve({
          success: false,
          error: `Failed to execute Python: ${err.message}`,
          executionTime: Date.now() - startTime,
        });
      });
    });
  } catch (err) {
    const error = err as Error;
    return {
      success: false,
      error: `Failed to create temp file: ${error.message}`,
      executionTime: Date.now() - startTime,
    };
  }
}
