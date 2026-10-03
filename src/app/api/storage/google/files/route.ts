/**
 * /api/storage/google/files
 *
 * Handles file upload, listing, and deletion via the central Google Drive account.
 *
 * POST  → Upload a file to Drive, store metadata in Firestore
 * GET   → List files (optionally filtered by folder category)
 * DELETE → Delete a file from Drive and remove its Firestore record
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getGDriveAccessToken,
  getGDriveConfig,
  getEffectiveInvoiceFolder,
  uploadFileToDrive,
  createDriveResumableSession,
  deleteFile as driveDeleteFile,
  listFiles as driveListFiles,
  getFileMetadata,
  streamFile,
} from '@/lib/storage/google-drive';
import { firestoreSet, firestoreGet, firestoreDelete, firestoreList, isFirestoreEnabled } from '@/lib/storage/firestoreAdapter';
import type { GoogleDriveFileRecord } from '@/lib/storage/models';

// ── Firestore collection for Drive file records ───────────────────────────────

const COLLECTION = 'google_drive_files';

async function storeFileRecord(record: GoogleDriveFileRecord): Promise<void> {
  if (isFirestoreEnabled()) {
    await firestoreSet(COLLECTION, record.id, record as any);
  }
  // No local-disk fallback needed (these are supplemental metadata records only)
}

async function getFileRecord(id: string): Promise<GoogleDriveFileRecord | null> {
  if (!isFirestoreEnabled()) return null;
  return firestoreGet(COLLECTION, id) as Promise<GoogleDriveFileRecord | null>;
}

async function deleteFileRecord(id: string): Promise<void> {
  if (isFirestoreEnabled()) {
    await firestoreDelete(COLLECTION, id);
  }
}

async function listFileRecords(): Promise<GoogleDriveFileRecord[]> {
  if (!isFirestoreEnabled()) return [];
  const docs = await firestoreList(COLLECTION);
  return docs as GoogleDriveFileRecord[];
}

// ── POST — Upload / Init Direct Resumable Session ─────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const config = await getGDriveConfig();
    if (!config?.connected || config.status !== 'connected') {
      return NextResponse.json({ error: 'Google Drive is not connected' }, { status: 503 });
    }

    const contentType = req.headers.get('content-type') || '';

    // 1. Direct Resumable Upload Session (Bypasses serverless payload limits & RAM buffers)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.action === 'init_resumable') {
        const {
          name,
          mimeType = 'application/octet-stream',
          size = 0,
          folderCategory = 'attachments',
          folderId: specifiedFolderId,
        } = body;

        const folders = config.folders ?? {};
        const folderId: string =
          specifiedFolderId || (folders as any)[folderCategory] || folders.attachments || config.rootFolderId || '';

        if (!folderId) {
          return NextResponse.json({ error: 'Drive folder not found. Reconnect Google Drive.' }, { status: 500 });
        }

        const accessToken = await getGDriveAccessToken();
        const origin = req.headers.get('origin') || undefined;
        const uploadUrl = await createDriveResumableSession(
          name,
          mimeType,
          Number(size),
          folderId,
          accessToken,
          origin,
        );

        return NextResponse.json({
          directUpload: true,
          uploadUrl,
          folderId,
        });
      }
    }

    // 2. Standard multipart upload (proxy through server)
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Optional metadata from the caller
    const folderCategory = (formData.get('folderCategory') as string | null) ?? 'attachments';
    const chatId         = (formData.get('chatId')         as string | null) ?? null;
    const projectId      = (formData.get('projectId')      as string | null) ?? null;
    const clientId       = (formData.get('clientId')       as string | null) ?? null;
    const workspaceId    = (formData.get('workspaceId')    as string | null) ?? null;
    const uploadedBy     = (formData.get('uploadedBy')     as string | null) ?? 'unknown';
    const uploadedByName = (formData.get('uploadedByName') as string | null) ?? undefined;
    const customName     = (formData.get('name')           as string | null) ?? file.name;

    // Pick the right Drive folder: support direct folderId or category mapping
    const specifiedFolderId = formData.get('folderId') as string | null;
    const folders = config.folders ?? {};
    let folderId: string = specifiedFolderId || (folders as any)[folderCategory] || '';

    if (!folderId && (folderCategory === 'invoices' || customName.toLowerCase().endsWith('.pdf'))) {
      const eff = await getEffectiveInvoiceFolder();
      folderId = eff.id;
    }
    if (!folderId) {
      folderId = folders.attachments || config.rootFolderId || '';
    }

    if (!folderId) {
      return NextResponse.json({ error: 'Drive folder not found. Reconnect Google Drive.' }, { status: 500 });
    }

    const accessToken = await getGDriveAccessToken();

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const driveFile = await uploadFileToDrive(buffer, customName, file.type || 'application/octet-stream', folderId, accessToken);

    const record: GoogleDriveFileRecord = {
      id:                      uuidv4(),
      name:                    customName,
      mimeType:                file.type || 'application/octet-stream',
      size:                    file.size,
      googleDriveFileId:       driveFile.id,
      googleDriveFolderId:     folderId,
      googleDriveWebViewLink:  driveFile.webViewLink,
      googleDriveDownloadLink: driveFile.webContentLink,
      folderCategory:          folderCategory as any,
      chatId,
      projectId,
      clientId,
      workspaceId,
      uploadedBy,
      uploadedByName,
      createdAt:               new Date().toISOString(),
      storageProvider:         'google_drive',
    };

    await storeFileRecord(record);

    return NextResponse.json({
      id:            record.id,
      name:          record.name,
      url:           driveFile.webViewLink,
      downloadUrl:   driveFile.webContentLink,
      mimeType:      record.mimeType,
      size:          record.size,
      storageProvider: 'google_drive',
      googleDriveFileId: driveFile.id,
      streamUrl:     `/api/storage/google/files?stream=true&fileId=${driveFile.id}`,
    });
  } catch (err: any) {
    console.error('[GDrive Upload]', err);
    return NextResponse.json({ error: err.message ?? 'Upload failed' }, { status: 500 });
  }
}

// ── PUT — Register File Uploaded Directly to Drive ────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const config = await getGDriveConfig();
    if (!config?.connected || config.status !== 'connected') {
      return NextResponse.json({ error: 'Google Drive is not connected' }, { status: 503 });
    }

    const body = await req.json();
    const {
      googleDriveFileId,
      name,
      mimeType = 'application/octet-stream',
      size = 0,
      folderCategory = 'attachments',
      folderId,
      chatId,
      projectId,
      clientId,
      workspaceId,
      uploadedBy = 'unknown',
      uploadedByName,
      webViewLink,
      webContentLink,
    } = body;

    if (!googleDriveFileId) {
      return NextResponse.json({ error: 'googleDriveFileId is required' }, { status: 400 });
    }

    // Refresh metadata directly from Google Drive if links are missing
    let finalWebViewLink = webViewLink;
    let finalWebContentLink = webContentLink;
    let finalName = name;
    let finalMimeType = mimeType;
    let finalSize = size;

    try {
      const accessToken = await getGDriveAccessToken();
      const meta = await getFileMetadata(googleDriveFileId, accessToken);
      if (meta) {
        finalWebViewLink = meta.webViewLink || finalWebViewLink;
        finalWebContentLink = meta.webContentLink || finalWebContentLink;
        finalName = meta.name || finalName;
        finalMimeType = meta.mimeType || finalMimeType;
        finalSize = meta.size ? Number(meta.size) : finalSize;
      }
    } catch (metaErr) {
      console.warn('[GDrive PUT] Could not fetch fresh metadata:', metaErr);
    }

    const record: GoogleDriveFileRecord = {
      id:                      uuidv4(),
      name:                    finalName,
      mimeType:                finalMimeType,
      size:                    Number(finalSize),
      googleDriveFileId,
      googleDriveFolderId:     folderId || '',
      googleDriveWebViewLink:  finalWebViewLink || '',
      googleDriveDownloadLink: finalWebContentLink || '',
      folderCategory:          folderCategory as any,
      chatId:                  chatId || null,
      projectId:               projectId || null,
      clientId:                clientId || null,
      workspaceId:             workspaceId || null,
      uploadedBy,
      uploadedByName,
      createdAt:               new Date().toISOString(),
      storageProvider:         'google_drive',
    };

    await storeFileRecord(record);

    return NextResponse.json({
      id:                record.id,
      name:              record.name,
      url:               record.googleDriveWebViewLink,
      downloadUrl:       record.googleDriveDownloadLink,
      mimeType:          record.mimeType,
      size:              record.size,
      storageProvider:   'google_drive',
      googleDriveFileId: record.googleDriveFileId,
      streamUrl:         `/api/storage/google/files?stream=true&fileId=${record.googleDriveFileId}`,
    });
  } catch (err: any) {
    console.error('[GDrive Register]', err);
    return NextResponse.json({ error: err.message ?? 'Registration failed' }, { status: 500 });
  }
}

// ── GET — List / Stream ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream') === 'true';
    const fileId = searchParams.get('fileId') || searchParams.get('driveFileId');

    // 1. Direct binary proxy streaming (for <img>, <video>, audio, preview, download)
    if (stream && fileId) {
      const accessToken = await getGDriveAccessToken();
      const meta = await getFileMetadata(fileId, accessToken).catch(() => null);
      const streamRes = await streamFile(fileId, accessToken);

      const headers = new Headers();
      if (meta?.mimeType) {
        headers.set('Content-Type', meta.mimeType);
      } else {
        const ct = streamRes.headers.get('Content-Type');
        if (ct) headers.set('Content-Type', ct);
      }
      if (meta?.size) {
        headers.set('Content-Length', meta.size);
      }
      headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(meta?.name || 'file')}"`);

      return new Response(streamRes.body, { status: 200, headers });
    }

    const folderId = searchParams.get('folderId');
    if (folderId) {
      // List directly from Drive folder
      const accessToken = await getGDriveAccessToken();
      const files = await driveListFiles(folderId, accessToken);
      return NextResponse.json({ files });
    }

    // Return Firestore metadata records
    const records = await listFileRecords();
    return NextResponse.json({ files: records });
  } catch (err: any) {
    console.error('[GDrive List/Stream]', err);
    return NextResponse.json({ error: err.message ?? 'Operation failed' }, { status: 500 });
  }
}

// ── DELETE — Remove ───────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const recordId = searchParams.get('id');
    const driveFileId = searchParams.get('driveFileId');

    if (!recordId && !driveFileId) {
      return NextResponse.json({ error: 'Provide id or driveFileId' }, { status: 400 });
    }

    const accessToken = await getGDriveAccessToken();

    let fileIdToDelete = driveFileId;
    let recordIdToDelete = recordId;

    if (recordId && !driveFileId) {
      const record = await getFileRecord(recordId);
      if (!record) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }
      fileIdToDelete = record.googleDriveFileId;
    }

    if (fileIdToDelete) {
      await driveDeleteFile(fileIdToDelete, accessToken);
    }

    if (recordIdToDelete) {
      await deleteFileRecord(recordIdToDelete);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[GDrive Delete]', err);
    return NextResponse.json({ error: err.message ?? 'Delete failed' }, { status: 500 });
  }
}
