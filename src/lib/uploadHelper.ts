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
 * Uploads a file using either standard form-data POST (for small files)
 * or chunked/resumable POST (for larger files).
 */
export async function uploadFile(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const chunkSize = options.chunkSize || 10 * 1024 * 1024; // Default: 10MB chunks
  const totalSize = file.size;

  // Use simple standard upload for files <= 5MB (and not part of folder uploads)
  if (totalSize <= 5 * 1024 * 1024 && !options.folderId) {
    return uploadFileNormal(file, options);
  }

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
