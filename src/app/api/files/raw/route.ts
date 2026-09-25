import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { STORAGE_ROOT, getSettings, ensureDirs } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';
import { uploadToR2, isR2Enabled } from '@/lib/storage/r2Adapter';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('name');
    const type = searchParams.get('type') || 'upload'; // 'upload' or 'avatar'

    if (!fileName) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    if (!request.body) {
      return NextResponse.json({ error: 'No file body provided' }, { status: 400 });
    }

    const subFolder = type === 'avatar' ? 'avatars' : 'uploads';
    const uploadDirPath = path.join(STORAGE_ROOT, subFolder);
    
    // Secure naming
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const uniqueName = `${Date.now()}_${uuidv4()}_${sanitizedName}`;
    const targetFilePath = path.join(uploadDirPath, uniqueName);

    // Read chunks from request body
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalBytes += value.length;
      }
    }

    const fullBuffer = Buffer.concat(chunks);

    // Save locally if writable (catches read-only environment errors)
    try {
      await ensureDirs();
      await fs.promises.mkdir(uploadDirPath, { recursive: true });
      await fs.promises.writeFile(targetFilePath, fullBuffer);
    } catch (err) {
      if (!isR2Enabled()) {
        throw err;
      }
    }

    let fileUrl = `/api/files?name=${uniqueName}&type=${type}`;
    const mimeType = request.headers.get('content-type') || 'application/octet-stream';

    // Upload to Cloudflare R2 if enabled
    if (isR2Enabled()) {
      try {
        const r2Key = `${subFolder}/${uniqueName}`;
        const r2Res = await uploadToR2(r2Key, fullBuffer, mimeType);
        fileUrl = r2Res.url;
      } catch (err) {
        console.error('Failed to upload raw stream to Cloudflare R2:', err);
      }
    }

    // Log the file saving
    await logInfo('FILE', `Raw file uploaded by ${user.username}: ${sanitizedName} (${uniqueName})`, {
      originalName: fileName,
      savedName: uniqueName,
      sizeBytes: totalBytes,
      type
    });

    return NextResponse.json({
      id: uuidv4(),
      name: sanitizedName,
      savedName: uniqueName,
      url: fileUrl,
      size: totalBytes,
      mimeType
    });

  } catch (error: any) {
    await logError('FILE', 'Raw upload failed', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
