// Environment configuration with validation

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  // Server
  port: parseInt(optional("PORT", "3000")),

  // Anthropic
  anthropicApiKey: required("ANTHROPIC_API_KEY"),

  // Neon PostgreSQL
  databaseUrl: required("DATABASE_URL"),

  // Cloudflare R2
  r2: {
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucketName: optional("R2_BUCKET_NAME", "jot-storage"),
    publicUrl: optional("R2_PUBLIC_URL", ""),
  },
} as const;
