# Storage Module - Claude.md

## Overview
Cloudflare R2 object storage using AWS S3 SDK (R2 is S3-compatible).

## Files

### `r2.ts`
R2 client and operations:
- `uploadFile()` - Store a file
- `getFile()` - Retrieve a file
- `deleteFile()` - Remove a file
- `listFiles()` - List files by prefix
- `getFileMetadata()` - Get file info without downloading
- `getUploadUrl()` - Presigned URL for direct upload
- `getDownloadUrl()` - Presigned URL for direct download

## Configuration

R2 credentials in environment:
- `R2_ACCOUNT_ID` - Cloudflare account ID
- `R2_ACCESS_KEY_ID` - R2 API token ID
- `R2_SECRET_ACCESS_KEY` - R2 API token secret
- `R2_BUCKET_NAME` - Storage bucket name
- `R2_PUBLIC_URL` - Optional public URL for the bucket

## File Organization

Suggested path structure:
```
voice/
  2024/
    01/
      recording-{timestamp}.webm
images/
  {context}/
    {filename}.{ext}
documents/
  {category}/
    {filename}.pdf
exports/
  {date}/
    backup.json
```

## Usage Patterns

### Storing Voice Recordings
```typescript
const key = `voice/${date}/${id}.webm`;
await uploadFile(key, audioBuffer, 'audio/webm', {
  duration: '30',
  transcription: 'text...'
});
```

### Storing Images
```typescript
const key = `images/${context}/${filename}`;
await uploadFile(key, imageBuffer, 'image/png');
```

### Generating Upload URLs
For large files, use presigned URLs:
```typescript
const { url } = await getUploadUrl('uploads/large-file.zip', 'application/zip');
// Client uploads directly to this URL
```

## Metadata

Files can have custom metadata:
```typescript
await uploadFile(key, data, contentType, {
  'source': 'voice-recording',
  'entry-id': 'uuid-here',
  'tags': 'important,meeting'
});
```

## Integration with Database

Common pattern - store file reference in DB:
```sql
INSERT INTO entries (type, content, metadata)
VALUES ('voice', 'Transcription here', 
  '{"file_key": "voice/2024/01/rec.webm", "duration": 30}');
```

## Error Handling

All functions return result objects:
```typescript
// Success
{ success: true, key: '...', url: '...' }

// Failure  
{ success: false, error: 'Error message' }
```

