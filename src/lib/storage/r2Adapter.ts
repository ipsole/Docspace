import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

let s3ClientInstance: S3Client | null = null;

export interface R2FileEntry {
  key: string;
  size: number;
  lastModified?: string;
  etag?: string;
}

// In-memory cache for R2 object listings to save Class A operations ($4.50/M) and provide instant 0ms responses
const r2ListCache = new Map<string, { entries: R2FileEntry[]; cachedAt: number }>();
const R2_LIST_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function isR2Enabled(): boolean {
  return (
    process.env.STORAGE_BACKEND === 'r2' &&
    Boolean(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
    )
  );
}

export function getR2Client(): S3Client | null {
  if (s3ClientInstance) return s3ClientInstance;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  s3ClientInstance = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3ClientInstance;
}

export function getR2BucketName(): string {
  return process.env.R2_BUCKET_NAME || '';
}

/**
 * Returns public CDN or proxy URL for an R2 key.
 * If R2_PUBLIC_URL is configured (e.g. Cloudflare custom domain), files are served
 * directly from Cloudflare's edge network for 0 latency and 0 server load.
 */
export function getR2PublicUrl(key: string): string {
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') || '';
  if (publicBase) {
    return `${publicBase}/${key}`;
  }
  
  // Format as /api/files endpoint
  const parts = key.split('/');
  if (parts.length >= 2) {
    const type = parts[0];
    const name = parts.slice(1).join('/');
    return `/api/files?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  }
  return `/api/files?name=${encodeURIComponent(key)}`;
}

/**
 * Uploads a file to Cloudflare R2 with automatic list cache invalidation.
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  if (!client || !bucket) {
    throw new Error('Cloudflare R2 is not configured properly.');
  }

  // Bust listing cache so fresh uploads appear immediately
  r2ListCache.clear();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body as any,
      ContentType: contentType,
      // Instruct downstream CDN / browsers to cache static asset immutably
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {
    key,
    url: getR2PublicUrl(key),
  };
}

/**
 * Fetches an object stream and metadata from Cloudflare R2.
 */
export async function getFromR2(key: string): Promise<{
  stream: any;
  contentType: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
} | null> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  if (!client || !bucket) return null;

  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return {
      stream: res.Body,
      contentType: res.ContentType || 'application/octet-stream',
      contentLength: res.ContentLength,
      etag: res.ETag,
      lastModified: res.LastModified,
    };
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.error(`Error getting object from R2 [${key}]:`, err);
    return null;
  }
}

/**
 * Deletes an object from Cloudflare R2 and invalidates listing cache.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  if (!client || !bucket) return;

  r2ListCache.clear();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (err) {
    console.error(`Failed to delete file from R2 [${key}]:`, err);
  }
}

/**
 * Lists objects in R2 with in-memory caching to prevent Class A operation bill inflation.
 */
export async function listFromR2(prefix?: string): Promise<R2FileEntry[]> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  if (!client || !bucket) return [];

  const cacheKey = prefix || '__all__';
  const now = Date.now();
  const cached = r2ListCache.get(cacheKey);
  if (cached && (now - cached.cachedAt < R2_LIST_CACHE_TTL_MS)) {
    return cached.entries;
  }

  try {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      })
    );

    const entries: R2FileEntry[] = (res.Contents || [])
      .map(obj => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified?.toISOString(),
        etag: obj.ETag,
      }))
      .filter(e => Boolean(e.key));

    r2ListCache.set(cacheKey, { entries, cachedAt: now });
    return entries;
  } catch (err) {
    console.error(`Error listing objects from R2 [${prefix}]:`, err);
    return [];
  }
}
