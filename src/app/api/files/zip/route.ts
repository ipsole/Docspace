import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { STORAGE_ROOT, ensureDirs } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    
    // We expect folderName (e.g. "myfolder")
    const folderName = formData.get('folderName') as string || 'folder';
    const entries = Array.from(formData.entries());
    
    // We collect all files and their relative paths
    const files: { file: File; relativePath: string }[] = [];
    
    // Form data format: file_0, path_0, file_1, path_1, ...
    for (const [key, value] of entries) {
      if (key.startsWith('file_')) {
        const index = key.substring(5); // get index e.g. "0"
        const file = value as File;
        const relativePath = formData.get(`path_${index}`) as string;
        if (file && relativePath) {
          files.push({ file, relativePath });
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files to zip' }, { status: 400 });
    }

    // Create a new Zip Archive
    const zip = new AdmZip();
    
    for (const item of files) {
      const buffer = Buffer.from(await item.file.arrayBuffer());
      zip.addFile(item.relativePath, buffer);
    }

    const zipBuffer = zip.toBuffer();
    const sizeBytes = zipBuffer.length;

    // Secure file naming
    const sanitizedFolderName = folderName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const zipName = `${sanitizedFolderName}.zip`;
    const uniqueName = `${Date.now()}_${uuidv4()}_${zipName}`;

    const uploadDirPath = path.join(STORAGE_ROOT, 'uploads');
    const targetFilePath = path.join(uploadDirPath, uniqueName);

    // Make sure upload directory exists
    await ensureDirs();
    await fs.mkdir(uploadDirPath, { recursive: true });

    // Save Zip file
    await fs.writeFile(targetFilePath, zipBuffer);

    await logInfo('FILE', `Folder zipped and uploaded by ${user.username}: ${zipName} (${uniqueName})`, {
      originalName: zipName,
      savedName: uniqueName,
      sizeBytes,
      mimeType: 'application/zip',
      type: 'upload'
    });

    const fileUrl = `/api/files?name=${uniqueName}&type=upload`;

    return NextResponse.json({
      id: uuidv4(),
      name: zipName,
      savedName: uniqueName,
      url: fileUrl,
      size: sizeBytes,
      mimeType: 'application/zip'
    });

  } catch (error: any) {
    await logError('FILE', 'Folder zip and upload failed', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
