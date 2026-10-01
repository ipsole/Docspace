import { v4 as uuidv4 } from 'uuid';

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadOptions {
  chatId?: string;
  type?: string; // 'upload' or 'avatar'
  onProgress?: (event: UploadProgressEvent) => void;
  chunkSize?: number; // Defaults to 10MB
  folderId?: string;
  relativePath?: string;
  filename?: string;
}

export interface UploadResult {
  id: string;
  name: string;
  savedName: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface FolderFileItem {
  file: File;
  path: string; // relative path, e.g. "subfolder/image.png"
}

/**
 * Direct browser-to-Cloudflare-R2 upload using pre-signed PUT URL.
 * Bypasses all serverless execution timeouts, memory limits, and request body payload caps.
 */
function uploadDirectToR2(
  uploadUrl: string,
  file: File,
  mimeType: string,
  onProgress?: (event: UploadProgressEvent) => void
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100),
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(true);
      } else {
        reject(new Error(`R2 direct upload returned status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error or CORS policy blocked direct upload to storage'));
    };

    xhr.send(file);
  });
}

/**
 * Uploads a file using direct Cloudflare R2 presigned upload (ideal for production/large files),
 * standard form-data POST (for small files), or chunked upload.
 */
export async function uploadFile(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const totalSize = file.size;
  const filename = options.filename || file.name;
  const mimeType = file.type || 'application/octet-stream';
  const type = options.type || 'upload';

  // 1. Attempt direct Cloudflare R2 upload (unless part of a folder zip upload)
  if (!options.folderId) {
    try {
      const presignedRes = await fetch('/api/files/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          size: totalSize,
          mimeType,
          type,
        }),
      });

      if (presignedRes.ok) {
        const presignedData = await presignedRes.json();
        if (presignedData.directUpload && presignedData.uploadUrl) {
          // Direct browser-to-R2 upload with live progress tracking
          await uploadDirectToR2(presignedData.uploadUrl, file, mimeType, options.onProgress);

          // Register finalized file on server
          const registerRes = await fetch('/api/files/presigned', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: presignedData.key,
              name: presignedData.name,
              savedName: presignedData.savedName,
              size: totalSize,
              mimeType,
              type,
              chatId: options.chatId,
            }),
          });

          if (registerRes.ok) {
            return await registerRes.json();
          }
        }
      }
    } catch (err: any) {
      console.warn('Direct R2 upload attempt failed, checking fallback:', err.message);
      // If file is > 4.5MB and blocked by CORS/network, notify with actionable message
      if (totalSize > 4.5 * 1024 * 1024 && (err.message?.includes('CORS') || err.message?.includes('Network error'))) {
        throw new Error('Direct upload blocked by Cloudflare R2 CORS. Please enable CORS on your R2 bucket in Cloudflare dashboard.');
      }
    }
  }

  // Fallback 1: Simple standard upload for files <= 4.5MB
  if (totalSize <= 4.5 * 1024 * 1024 && !options.folderId) {
    return uploadFileNormal(file, options);
  }

  // Fallback 2: Chunked upload (used for folder uploads and local dev fallback)
  const chunkSize = options.chunkSize || 10 * 1024 * 1024;
  return uploadFileChunked(file, chunkSize, options);
}

/**
 * Standard single-request file upload for smaller files.
 */
async function uploadFileNormal(
  file: File,
  options: UploadOptions
): Promise<UploadResult> {
  const formData = new FormData();
  if (options.filename) {
    formData.append('filename', options.filename);
    formData.append('file', file, options.filename);
  } else {
    formData.append('file', file);
  }
  if (options.chatId) {
    formData.append('chatId', options.chatId);
  }
  if (options.type) {
    formData.append('type', options.type);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files', true);

    if (options.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          options.onProgress!({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100),
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch (err) {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.error || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

/**
 * Chunked file upload for larger files.
 */
async function uploadFileChunked(
  file: File,
  chunkSize: number,
  options: UploadOptions
): Promise<UploadResult> {
  const totalSize = file.size;
  const filename = options.filename || file.name;
  const mimeType = file.type || 'application/octet-stream';
  const type = options.type || 'upload';

  // Step 1: Initialize Upload Session
  const initRes = await fetch('/api/files/chunk?action=init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      totalSize,
      chunkSize,
      mimeType,
      type,
      folderId: options.folderId,
      relativePath: options.relativePath,
    }),
  });

  if (!initRes.ok) {
    const errData = await initRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to initialize chunked upload');
  }

  const { uploadId, totalChunks } = await initRes.json();

  let bytesUploaded = 0;

  // Helper to wait/sleep
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Step 2: Upload Chunks sequentially
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, totalSize);
    const chunkBlob = file.slice(start, end);

    const maxRetries = 3;
    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
      try {
        const uploadRes = await fetch(
          `/api/files/chunk?action=upload&uploadId=${uploadId}&chunkIndex=${chunkIndex}`,
          {
            method: 'POST',
            body: chunkBlob,
          }
        );

        if (uploadRes.ok) {
          success = true;
        } else {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || `Chunk ${chunkIndex} upload failed`);
        }
      } catch (err: any) {
        attempt++;
        console.warn(`Chunk ${chunkIndex} upload failed (Attempt ${attempt}/${maxRetries}):`, err.message);
        if (attempt >= maxRetries) {
          throw new Error(`Upload aborted: failed to upload chunk ${chunkIndex} after ${maxRetries} attempts.`);
        }
        await delay(attempt * 1000);
      }
    }

    // Update progress
    bytesUploaded += chunkBlob.size;
    if (options.onProgress) {
      options.onProgress({
        loaded: bytesUploaded,
        total: totalSize,
        percentage: Math.round((bytesUploaded / totalSize) * 100),
      });
    }
  }

  // Step 3: Complete Session
  const completeRes = await fetch('/api/files/chunk?action=complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });

  if (!completeRes.ok) {
    const errData = await completeRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to complete chunked upload');
  }

  return completeRes.json() as Promise<UploadResult>;
}

/**
 * Sequentially uploads files inside a folder in chunks, and then zips them on the server.
 */
export async function uploadFolder(
  files: FolderFileItem[],
  folderName: string,
  options: Omit<UploadOptions, 'folderId' | 'relativePath' | 'filename'> = {}
): Promise<UploadResult> {
  const folderId = uuidv4();
  const totalSize = files.reduce((sum, item) => sum + item.file.size, 0);
  let bytesUploaded = 0;

  // Upload each file sequentially
  for (const item of files) {
    const fileOptions: UploadOptions = {
      ...options,
      folderId,
      relativePath: item.path || item.file.name,
      filename: item.file.name,
      onProgress: (event) => {
        const currentTotalUploaded = bytesUploaded + event.loaded;
        if (options.onProgress) {
          options.onProgress({
            loaded: currentTotalUploaded,
            total: totalSize,
            percentage: Math.min(Math.round((currentTotalUploaded / totalSize) * 100), 99), // Cap at 99% until complete_folder finishes
          });
        }
      }
    };

    await uploadFile(item.file, fileOptions);
    bytesUploaded += item.file.size;

    if (options.onProgress) {
      options.onProgress({
        loaded: bytesUploaded,
        total: totalSize,
        percentage: Math.min(Math.round((bytesUploaded / totalSize) * 100), 99),
      });
    }
  }

  // Finalize the folder upload by requesting the server to compress it
  const completeRes = await fetch('/api/files/chunk?action=complete_folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId, folderName }),
  });

  if (!completeRes.ok) {
    const errData = await completeRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to compress folder on server');
  }

  const result = await completeRes.json();
  
  if (options.onProgress) {
    options.onProgress({
      loaded: totalSize,
      total: totalSize,
      percentage: 100,
    });
  }

  return result as UploadResult;
}

// ─── Google Drive upload ──────────────────────────────────────────────────────

export interface GoogleDriveUploadOptions {
  chatId?: string;
  projectId?: string;
  clientId?: string;
  workspaceId?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  folderCategory?: 'attachments' | 'projects' | 'clients' | 'assets' | 'deliverables' | 'archives';
  folderId?: string;
  filename?: string;
  onProgress?: (event: UploadProgressEvent) => void;
}

/**
 * Direct browser-to-Google-Drive upload using resumable session URI.
 * Bypasses all serverless execution timeouts, memory limits, and request body payload caps.
 */
function uploadDirectToGoogleDrive(
  uploadUrl: string,
  file: File,
  mimeType: string,
  onProgress?: (event: UploadProgressEvent) => void,
): Promise<{ id: string; name?: string; webViewLink?: string; webContentLink?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentage = Math.min(99, Math.round((e.loaded / e.total) * 100));
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage,
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json);
        } catch {
          resolve({ id: '' });
        }
      } else {
        reject(new Error(`Google Drive direct upload returned status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error or CORS policy blocked direct Google Drive upload'));
    };

    xhr.send(file);
  });
}

/**
 * Standard server-proxy multipart upload for small files (≤ 4.5MB).
 */
function uploadToGoogleDriveProxy(
  file: File,
  options: GoogleDriveUploadOptions = {},
): Promise<{
  id: string;
  name: string;
  url: string;
  downloadUrl?: string;
  streamUrl?: string;
  mimeType: string;
  size: number;
  storageProvider: 'google_drive';
  googleDriveFileId: string;
}> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    const name = options.filename || file.name;
    formData.append('file', file, name);
    formData.append('name', name);
    if (options.chatId)         formData.append('chatId',         options.chatId);
    if (options.projectId)      formData.append('projectId',      options.projectId);
    if (options.clientId)       formData.append('clientId',       options.clientId);
    if (options.workspaceId)    formData.append('workspaceId',    options.workspaceId);
    if (options.uploadedBy)     formData.append('uploadedBy',     options.uploadedBy);
    if (options.uploadedByName) formData.append('uploadedByName', options.uploadedByName);
    if (options.folderId)       formData.append('folderId',       options.folderId);
    formData.append('folderCategory', options.folderCategory ?? 'attachments');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/storage/google/files', true);

    options.onProgress?.({ loaded: 0, total: file.size, percentage: 0 });

    if (options.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentage = Math.min(99, Math.round((e.loaded / e.total) * 100));
          options.onProgress?.({
            loaded: e.loaded,
            total: e.total,
            percentage,
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          options.onProgress?.({ loaded: file.size, total: file.size, percentage: 100 });
          resolve(json);
        } catch {
          reject(new Error('Invalid response from Google Drive server'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || `Google Drive upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Google Drive upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during Google Drive upload'));
    };

    xhr.send(formData);
  });
}

/**
 * Upload a file to the central Google Drive account.
 * Automatically uses direct browser-to-Drive resumable upload for large files
 * (bypassing Vercel/serverless payload caps and timeouts), with seamless proxy fallback.
 */
export async function uploadToGoogleDrive(
  file: File,
  options: GoogleDriveUploadOptions = {},
): Promise<{
  id: string;
  name: string;
  url: string;
  downloadUrl?: string;
  streamUrl?: string;
  mimeType: string;
  size: number;
  storageProvider: 'google_drive';
  googleDriveFileId: string;
}> {
  const name = options.filename || file.name;
  const mimeType = file.type || 'application/octet-stream';
  const size = file.size;

  // 1. Attempt direct browser-to-Google-Drive resumable upload (required for large files)
  try {
    const sessionRes = await fetch('/api/storage/google/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init_resumable',
        name,
        mimeType,
        size,
        folderCategory: options.folderCategory ?? 'attachments',
        folderId: options.folderId,
        chatId: options.chatId,
        projectId: options.projectId,
        clientId: options.clientId,
        workspaceId: options.workspaceId,
        uploadedBy: options.uploadedBy,
        uploadedByName: options.uploadedByName,
      }),
    });

    if (sessionRes.ok) {
      const sessionData = await sessionRes.json();
      if (sessionData.directUpload && sessionData.uploadUrl) {
        // Direct stream to Google Drive
        const driveData = await uploadDirectToGoogleDrive(
          sessionData.uploadUrl,
          file,
          mimeType,
          options.onProgress,
        );

        if (driveData.id) {
          // Register completed file in Firestore
          const regRes = await fetch('/api/storage/google/files', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              googleDriveFileId: driveData.id,
              name: driveData.name || name,
              mimeType,
              size,
              folderId: sessionData.folderId,
              folderCategory: options.folderCategory ?? 'attachments',
              chatId: options.chatId,
              projectId: options.projectId,
              clientId: options.clientId,
              workspaceId: options.workspaceId,
              uploadedBy: options.uploadedBy,
              uploadedByName: options.uploadedByName,
              webViewLink: driveData.webViewLink,
              webContentLink: driveData.webContentLink,
            }),
          });

          if (regRes.ok) {
            options.onProgress?.({ loaded: size, total: size, percentage: 100 });
            return await regRes.json();
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[GDrive Direct Upload] Falling back to proxy upload:', err.message);
    if (size > 4.5 * 1024 * 1024 && (err.message?.includes('CORS') || err.message?.includes('Network error'))) {
      throw new Error(`Large file upload blocked by Google Drive CORS or network: ${err.message}`);
    }
  }

  // 2. Fallback to standard server proxy (for files <= 4.5MB)
  return uploadToGoogleDriveProxy(file, options);
}

