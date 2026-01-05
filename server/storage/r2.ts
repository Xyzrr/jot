import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

// Upload file to R2
export async function uploadFile(
  key: string,
  data: Buffer | Uint8Array,
  contentType?: string
): Promise<{ success: true; key: string } | { success: false; error: string }> {
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
    return { success: true, key };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Get a presigned download URL for a file
export async function getDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

// Download file from R2
export async function downloadFile(
  key: string
): Promise<
  | { success: true; data: Buffer; contentType?: string }
  | { success: false; error: string }
> {
  try {
    const response = await r2.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const data = await response.Body?.transformToByteArray();
    if (!data) {
      return { success: false, error: "Empty response body" };
    }
    return {
      success: true,
      data: Buffer.from(data),
      contentType: response.ContentType,
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}
