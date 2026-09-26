import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { STORAGE_ROOT, getSettings, ensureDirs } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';
import { uploadToR2, isR2Enabled, getFromR2, listFromR2, deleteFromR2, getR2PublicUrl } from '@/lib/storage/r2Adapter';

function getMimeTypeFromExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.bmp': return 'image/bmp';
    case '.ico': return 'image/x-icon';
    case '.pdf': return 'application/pdf';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.mov': return 'video/quicktime';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.ogg': return 'audio/ogg';
    case '.m4a': return 'audio/mp4';
    case '.zip': return 'application/zip';
    case '.json': return 'application/json';
    case '.txt':
    case '.log': return 'text/plain; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.csv': return 'text/csv; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

// GET: Serve files securely from storage/uploads, storage/avatars, or Cloudflare R2
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('name');
    const type = searchParams.get('type') || 'upload'; // 'upload' or 'avatar'

    // 1. List files (when no specific filename is requested)
    if (!filename) {
      if (isR2Enabled()) {
        const r2Entries = await listFromR2('uploads/');
        const filesList = r2Entries.map(entry => {
          const fn = entry.key.replace(/^uploads\//, '');
          const parts = fn.split('_');
          const originalName = parts.length > 2 ? parts.slice(2).join('_') : fn;
          const mimeType = getMimeTypeFromExt(fn);

          return {
            name: originalName,
            savedName: fn,
            url: getR2PublicUrl(entry.key),
            size: entry.size,
            mimeType,
            createdAt: entry.lastModified || new Date().toISOString()
          };
        });

        filesList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return NextResponse.json(filesList);
      }

      // Local fallback for listing
      const uploadsDir = path.join(STORAGE_ROOT, 'uploads');
      try {
        await ensureDirs();
        await fs.mkdir(uploadsDir, { recursive: true });
        const filenames = await fs.readdir(uploadsDir).catch(() => []);
        
        const filesList = [];
        for (const fn of filenames) {
          if (fn.startsWith('.')) continue;
          const filePath = path.join(uploadsDir, fn);
          try {
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              const parts = fn.split('_');
              const originalName = parts.length > 2 ? parts.slice(2).join('_') : fn;
              const mimeType = getMimeTypeFromExt(fn);

              filesList.push({
                name: originalName,
                savedName: fn,
                url: `/api/files?name=${fn}`,
                size: stats.size,
                mimeType,
                createdAt: stats.birthtime.toISOString()
              });
            }
          } catch {}
        }

        filesList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return NextResponse.json(filesList);
      } catch {
        return NextResponse.json([]);
      }
    }

    // 2. Fetching a specific file
    let cleanRelPath = filename.replace(/\\/g, '/');
    while (cleanRelPath.startsWith('/')) cleanRelPath = cleanRelPath.slice(1);
    if (cleanRelPath.includes('..')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    let subFolder = 'uploads';
    if (type === 'avatar' || type === 'avatars') {
      subFolder = 'avatars';
    } else if (type === 'attachment' || type === 'attachments') {
      subFolder = 'attachments';
    } else if (type && !type.includes('..') && !type.includes('/') && !type.includes('\\')) {
      subFolder = type;
    }

    const baseFolder = path.join(STORAGE_ROOT, subFolder);
    const filePath = path.resolve(baseFolder, cleanRelPath);
    if (!filePath.startsWith(baseFolder)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }
    const safeFilename = path.basename(filePath);
    const contentType = getMimeTypeFromExt(safeFilename);

    // Check local disk first
    let localExists = false;
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) {
        localExists = true;
        const fileStream = createReadStream(filePath);
        return new Response(fileStream as any, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': stats.size.toString(),
            'Content-Disposition': `inline; filename="${encodeURIComponent(safeFilename)}"`,
            // Cache in browser for 1 year to minimize subsequent requests
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
    } catch {}

    // If not found locally, fetch directly from Cloudflare R2
    if (!localExists && isR2Enabled()) {
      const r2Key = `${subFolder}/${safeFilename}`;
      const r2Obj = await getFromR2(r2Key);

      if (r2Obj) {
        // Support HTTP 304 Not Modified to save bandwidth and response latency
        const clientEtag = request.headers.get('if-none-match');
        if (r2Obj.etag && clientEtag && clientEtag === r2Obj.etag) {
          return new Response(null, { status: 304 });
        }

        const headers: Record<string, string> = {
          'Content-Type': r2Obj.contentType || contentType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(safeFilename)}"`,
          // Instruct browser & CDN to cache asset immutably (0 repeated Class B reads from R2)
          'Cache-Control': 'public, max-age=31536000, immutable',
        };

        if (r2Obj.contentLength) {
          headers['Content-Length'] = r2Obj.contentLength.toString();
        }
        if (r2Obj.etag) {
          headers['ETag'] = r2Obj.etag;
        }

        const streamBody = r2Obj.stream?.transformToWebStream
          ? r2Obj.stream.transformToWebStream()
          : r2Obj.stream;

        return new Response(streamBody, { headers });
      }
    }

    return NextResponse.json({ error: 'File not found' }, { status: 404 });

  } catch (error: any) {
    console.error('File retrieval error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Upload files to Cloudflare R2 and optionally storage/uploads or storage/avatars
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await getSettings();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string || 'upload'; // 'upload' or 'avatar'

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const sizeBytes = file.size;
    const maxLimitMb = type === 'avatar' ? 5 : settings.maxUploadSizeMb;
    const maxLimitBytes = maxLimitMb * 1024 * 1024;

    if (sizeBytes > maxLimitBytes) {
      return NextResponse.json({ error: `File size exceeds the limit of ${maxLimitMb}MB` }, { status: 400 });
    }

    // Check MIME type
    const mimeType = file.type || getMimeTypeFromExt(file.name);
    const isAllowedMime = type === 'avatar' 
      ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
      : (settings.allowedMimeTypes.includes(mimeType) || mimeType.startsWith('audio/'));

    if (!isAllowedMime) {
      return NextResponse.json({ error: `File type '${mimeType}' is not allowed` }, { status: 400 });
    }

    const customFilename = (formData.get('filename') as string || file.name).trim();

    // Secure file naming
    const baseExt = path.extname(file.name);
    let targetName = customFilename || file.name;
    // Ensure file extension is retained if user omitted it
    if (baseExt && !path.extname(targetName)) {
      targetName = `${targetName}${baseExt}`;
    }
    const sanitizedName = targetName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const uniqueName = `${Date.now()}_${uuidv4()}_${sanitizedName}`;

    const subFolder = type === 'avatar' ? 'avatars' : 'uploads';
    const uploadDirPath = path.join(STORAGE_ROOT, subFolder);
    const targetFilePath = path.join(uploadDirPath, uniqueName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save File locally if writable (catches read-only errors on serverless/cloud platforms)
    try {
      await ensureDirs();
      await fs.mkdir(uploadDirPath, { recursive: true });
      await fs.writeFile(targetFilePath, buffer);
    } catch (err) {
      if (!isR2Enabled()) {
        throw err;
      }
    }

    let fileUrl = `/api/files?name=${uniqueName}&type=${type}`;

    // Upload to Cloudflare R2
    if (isR2Enabled()) {
      try {
        const r2Key = `${subFolder}/${uniqueName}`;
        const r2Res = await uploadToR2(r2Key, buffer, mimeType);
        fileUrl = r2Res.url;
      } catch (err: any) {
        console.error('Failed to upload file to Cloudflare R2:', err);
      }
    }

    await logInfo('FILE', `File uploaded by ${user.username}: ${sanitizedName} (${uniqueName})`, {
      originalName: file.name,
      savedName: uniqueName,
      sizeBytes,
      mimeType,
      type
    });

    return NextResponse.json({
      id: uuidv4(),
      name: sanitizedName,
      savedName: uniqueName,
      url: fileUrl,
      size: sizeBytes,
      mimeType
    });

  } catch (error: any) {
    await logError('FILE', 'Upload failed', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete files from storage/uploads and Cloudflare R2
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('name');

    if (!filename) {
      return NextResponse.json({ error: 'Missing file name' }, { status: 400 });
    }

    const safeFilename = path.basename(filename);
    const filePath = path.join(STORAGE_ROOT, 'uploads', safeFilename);

    // Delete from Cloudflare R2 if enabled
    if (isR2Enabled()) {
      await deleteFromR2(`uploads/${safeFilename}`);
      await deleteFromR2(`avatars/${safeFilename}`);
    }

    try {
      await fs.unlink(filePath);
    } catch (e: any) {
      if (e.code !== 'ENOENT' && !isR2Enabled()) {
        throw e;
      }
    }

    await logInfo('FILE', `File deleted by ${user.username}: ${safeFilename}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    await logError('FILE', 'Delete failed', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
