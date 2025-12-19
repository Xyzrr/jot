import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
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

// Upload a file to R2
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
  metadata?: Record<string, string>
) {
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      })
    );
    return { success: true, key, url: `${config.r2.publicUrl}/${key}` };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Get a file from R2
export async function getFile(key: string) {
  try {
    const response = await r2.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const body = await response.Body?.transformToByteArray();
    return {
      success: true,
      data: body,
      contentType: response.ContentType,
      metadata: response.Metadata,
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Delete a file from R2
export async function deleteFile(key: string) {
  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// List files in R2
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

// Get file metadata
export async function getFileMetadata(key: string) {
  try {
    const response = await r2.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return {
      success: true,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Generate a presigned URL for upload
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
) {
  try {
    const url = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn }
    );
    return { success: true, url };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

// Generate a presigned URL for download
export async function getDownloadUrl(key: string, expiresIn = 3600) {
  try {
    const url = await getSignedUrl(
      r2,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn }
    );
    return { success: true, url };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

