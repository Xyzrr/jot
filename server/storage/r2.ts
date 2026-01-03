import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { config } from "../config";

// Initialize R2 client (S3-compatible)
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

const bucket = config.r2.bucketName;

// List files in R2 (used by debug endpoint)
export async function listFiles(prefix?: string, maxKeys = 100) {
  try {
    const response = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      })
    );
    return {
      success: true,
      files:
        response.Contents?.map((obj) => ({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
        })) ?? [],
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}
