import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { open } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { STORAGE_ROOT, ensureDirs, cleanStaleTempUploads } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';
import { uploadToR2, isR2Enabled } from '@/lib/storage/r2Adapter';

interface UploadMetadata {
  uploadId: string;
  filename: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  mimeType: string;
  type: string;
  createdAt: string;
  tempFilePath: string;
  folderId?: string;
  relativePath?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'init') {
      // Trigger background auto-cleanup of stale scratch files older than 24h
      cleanStaleTempUploads({ throttle: true }).catch(() => {});
      const body = await request.json();
      const { filename, totalSize, chunkSize, mimeType, type, folderId, relativePath } = body;

      if (!filename || totalSize === undefined || totalSize === null || !chunkSize) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
      }

      const uploadId = uuidv4();
      const totalChunks = Math.ceil(totalSize / chunkSize);

      const tempDir = path.join(STORAGE_ROOT, 'temp_uploads');
      await ensureDirs();
      await fs.mkdir(tempDir, { recursive: true });

      let tempFilePath = '';
      if (folderId && relativePath) {
        // Prevent path traversal
        const safeRelativePath = relativePath.split('/').map((part: string) => path.basename(part)).join('/');
        tempFilePath = path.join(tempDir, folderId, safeRelativePath);
        // Ensure subdirectories inside temp folder exist
        await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
      } else {
        tempFilePath = path.join(tempDir, uploadId);
      }

      const metaFilePath = path.join(tempDir, `${uploadId}.json`);

      // Initialize empty file
      await fs.writeFile(tempFilePath, Buffer.alloc(0));

      const metadata: UploadMetadata = {
        uploadId,
        filename,
        totalSize,
        chunkSize,
        totalChunks,
        uploadedChunks: [],
        mimeType: mimeType || 'application/octet-stream',
        type: type || 'upload',
        createdAt: new Date().toISOString(),
        tempFilePath,
        folderId,
        relativePath,
      };

      await fs.writeFile(metaFilePath, JSON.stringify(metadata, null, 2), 'utf-8');

      return NextResponse.json({
        uploadId,
        chunkSize,
        totalChunks,
      });
    }

    if (action === 'upload') {
      const uploadId = searchParams.get('uploadId');
      const chunkIndexStr = searchParams.get('chunkIndex');

      if (!uploadId || !chunkIndexStr) {
        return NextResponse.json({ error: 'Missing uploadId or chunkIndex' }, { status: 400 });
      }

      const chunkIndex = parseInt(chunkIndexStr, 10);
      const tempDir = path.join(STORAGE_ROOT, 'temp_uploads');
      const metaFilePath = path.join(tempDir, `${uploadId}.json`);

      // Verify metadata exists
      let metadata: UploadMetadata;
      try {
        const metaContent = await fs.readFile(metaFilePath, 'utf-8');
        metadata = JSON.parse(metaContent);
      } catch (err) {
        return NextResponse.json({ error: 'Invalid or expired upload session' }, { status: 404 });
      }

      const tempFilePath = metadata.tempFilePath || path.join(tempDir, uploadId);

      if (!request.body) {
        return NextResponse.json({ error: 'No chunk data provided' }, { status: 400 });
      }

      // Read chunk data from body stream
      const reader = request.body.getReader();
      const chunksList: Buffer[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunksList.push(Buffer.from(value));
      }
      const chunkBuffer = Buffer.concat(chunksList);

      // Write chunk to specific offset in the temp file
      const offset = chunkIndex * metadata.chunkSize;
      
      const fileHandle = await open(tempFilePath, 'r+');
      await fileHandle.write(chunkBuffer, 0, chunkBuffer.length, offset);
      await fileHandle.close();

      // Update uploaded chunks in metadata
      if (!metadata.uploadedChunks.includes(chunkIndex)) {
        metadata.uploadedChunks.push(chunkIndex);
        await fs.writeFile(metaFilePath, JSON.stringify(metadata, null, 2), 'utf-8');
      }

      return NextResponse.json({ success: true, chunkIndex });
    }

    if (action === 'complete') {
      const body = await request.json();
      const { uploadId } = body;

      if (!uploadId) {
        return NextResponse.json({ error: 'Missing uploadId' }, { status: 400 });
      }

      const tempDir = path.join(STORAGE_ROOT, 'temp_uploads');
      const metaFilePath = path.join(tempDir, `${uploadId}.json`);

      // Read metadata
      let metadata: UploadMetadata;
      try {
        const metaContent = await fs.readFile(metaFilePath, 'utf-8');
        metadata = JSON.parse(metaContent);
      } catch (err) {
        return NextResponse.json({ error: 'Invalid or expired upload session' }, { status: 404 });
      }

      const tempFilePath = metadata.tempFilePath || path.join(tempDir, uploadId);

      // Check if all chunks were uploaded
      if (metadata.uploadedChunks.length < metadata.totalChunks) {
        return NextResponse.json({
          error: `Upload incomplete. Uploaded ${metadata.uploadedChunks.length} of ${metadata.totalChunks} chunks.`,
          uploadedChunks: metadata.uploadedChunks,
        }, { status: 400 });
      }

      // Verify file size
      const stat = await fs.stat(tempFilePath);
      if (stat.size !== metadata.totalSize) {
        return NextResponse.json({
          error: `File size mismatch. Expected ${metadata.totalSize} bytes, got ${stat.size} bytes.`,
        }, { status: 400 });
      }

      // If it belongs to a folder upload, do not move it yet! Just delete metadata and return success.
      if (metadata.folderId) {
        await fs.unlink(metaFilePath).catch(() => {});
        return NextResponse.json({
          success: true,
          message: 'Chunked file inside folder completed successfully',
          filename: metadata.filename,
          relativePath: metadata.relativePath
        });
      }

      // Generate finalized secure path
      const sanitizedName = metadata.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const uniqueName = `${Date.now()}_${uuidv4()}_${sanitizedName}`;

      const subFolder = metadata.type === 'avatar' ? 'avatars' : 'uploads';
      const destDir = path.join(STORAGE_ROOT, subFolder);
      const destFilePath = path.join(destDir, uniqueName);

      await ensureDirs();
      await fs.mkdir(destDir, { recursive: true });

      // Move temporary file to destination
      await fs.rename(tempFilePath, destFilePath);

      // Clean up metadata file
      await fs.unlink(metaFilePath).catch(() => {});

      await logInfo('FILE', `Chunked file upload completed by ${user.username}: ${sanitizedName} (${uniqueName})`, {
        originalName: metadata.filename,
        savedName: uniqueName,
        sizeBytes: metadata.totalSize,
        type: metadata.type
      });

      let fileUrl = `/api/files?name=${uniqueName}&type=${metadata.type}`;

      if (isR2Enabled()) {
        try {
          const fileBuffer = await fs.readFile(destFilePath);
          const r2Key = `${subFolder}/${uniqueName}`;
          const r2Res = await uploadToR2(r2Key, fileBuffer, metadata.mimeType);
          fileUrl = r2Res.url;
        } catch (err) {
          console.error('Failed to upload chunked file to Cloudflare R2:', err);
        }
      }

      return NextResponse.json({
        id: uuidv4(),
        name: sanitizedName,
        savedName: uniqueName,
        url: fileUrl,
        size: metadata.totalSize,
        mimeType: metadata.mimeType
      });
    }

    if (action === 'complete_folder') {
      const body = await request.json();
      const { folderId, folderName } = body;

      if (!folderId || !folderName) {
        return NextResponse.json({ error: 'Missing folderId or folderName' }, { status: 400 });
      }

      const tempDir = path.join(STORAGE_ROOT, 'temp_uploads');
      const folderPath = path.join(tempDir, folderId);

      // Check if folder exists
      try {
        const stat = await fs.stat(folderPath);
        if (!stat.isDirectory()) {
          return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }
      } catch {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      }

      const sanitizedFolderName = folderName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const zipName = `${sanitizedFolderName}.zip`;
      const uniqueName = `${Date.now()}_${uuidv4()}_${zipName}`;

      const destDir = path.join(STORAGE_ROOT, 'uploads');
      const zipFilePath = path.join(destDir, uniqueName);

      await ensureDirs();
      await fs.mkdir(destDir, { recursive: true });

      // Spawns native macOS/Linux zip command for high efficiency stream compression
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execPromise = promisify(exec);

      try {
        await execPromise(`zip -r "${zipFilePath}" .`, { cwd: folderPath });
      } catch (err: any) {
        console.warn('Native zip failed, falling back to adm-zip...', err.message);
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        zip.addLocalFolder(folderPath);
        await zip.writeZipPromise(zipFilePath);
      }

      const zipStat = await fs.stat(zipFilePath);

      // Clean up temporary folder
      await fs.rm(folderPath, { recursive: true, force: true }).catch(() => {});

      await logInfo('FILE', `Folder zipped and uploaded on server by ${user.username}: ${zipName} (${uniqueName})`, {
        originalName: zipName,
        savedName: uniqueName,
        sizeBytes: zipStat.size,
        type: 'upload'
      });

      const fileUrl = `/api/files?name=${uniqueName}&type=upload`;

      return NextResponse.json({
        id: uuidv4(),
        name: zipName,
        savedName: uniqueName,
        url: fileUrl,
        size: zipStat.size,
        mimeType: 'application/zip'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    await logError('FILE', 'Chunked upload error', { error: error.message, stack: error.stack });
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
