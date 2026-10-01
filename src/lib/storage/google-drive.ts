/**
 * Google Drive Central Storage Service
 *
 * ONE shared Drive account connected by admin via OAuth.
 * Refresh token stored server-side only (Firestore / local storage/settings).
 * Never exposed to the browser.
 */

import path from 'path';
import { STORAGE_ROOT, safeReadFile, safeWriteFile } from './storage';
import type { GoogleDriveConfig, GoogleDriveFolderMap } from './models';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(STORAGE_ROOT, 'settings', 'gdrive_config.json');

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const FOLDER_STRUCTURE: { key: keyof GoogleDriveFolderMap; name: string }[] = [
  { key: 'clients',       name: 'Clients'       },
  { key: 'projects',      name: 'Projects'      },
  { key: 'assets',        name: 'Assets'        },
  { key: 'deliverables',  name: 'Deliverables'  },
  { key: 'attachments',   name: 'Attachments'   },
  { key: 'archives',      name: 'Archives'      },
];

// ─── Config persistence ───────────────────────────────────────────────────────

export async function getGDriveConfig(): Promise<GoogleDriveConfig | null> {
  try {
    const raw = await safeReadFile(CONFIG_PATH);
    if (!raw) return null;
    return JSON.parse(raw) as GoogleDriveConfig;
  } catch {
    return null;
  }
}

export async function saveGDriveConfig(config: GoogleDriveConfig): Promise<void> {
  await safeWriteFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── OAuth – token exchange ───────────────────────────────────────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 * Only called once during the admin "connect" flow.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId     = process.env.GOOGLE_DRIVE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET!;
  const redirectUri  = process.env.GOOGLE_DRIVE_REDIRECT_URI!;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return res.json();
}

interface CachedDriveToken {
  token: string;
  expiresAt: number;
}

let cachedDriveToken: CachedDriveToken | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

/**
 * Use the stored refresh token to obtain a fresh access token.
 * Caches the access token in memory for ~50 minutes to eliminate redundant OAuth roundtrips.
 */
export async function getGDriveAccessToken(): Promise<string> {
  const now = Date.now();
  // Return cached token if valid for at least 2 more minutes
  if (cachedDriveToken && cachedDriveToken.expiresAt - now > 2 * 60 * 1000) {
    return cachedDriveToken.token;
  }

  // Deduplicate concurrent token exchange requests
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    try {
      const config = await getGDriveConfig();
      if (!config?.refreshToken) {
        throw new Error('Google Drive is not connected. No refresh token found.');
      }

      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: config.refreshToken,
          client_id:     process.env.GOOGLE_DRIVE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
          grant_type:    'refresh_token',
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to refresh access token: ${err}`);
      }

      const data = await res.json();
      const accessToken = data.access_token as string;
      const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
      // Cache with a 5-minute safety margin before true expiration
      cachedDriveToken = {
        token: accessToken,
        expiresAt: Date.now() + Math.max(60, expiresInSec - 300) * 1000,
      };

      return accessToken;
    } finally {
      inFlightTokenPromise = null;
    }
  })();

  return inFlightTokenPromise;
}

// ─── Folder management ────────────────────────────────────────────────────────

async function driveRequest(
  url: string,
  options: RequestInit,
  accessToken: string,
): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error ${res.status}: ${text}`);
  }

  const ct = res.headers.get('Content-Type') ?? '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

/** Create a folder in Google Drive and return its ID. */
export async function createFolder(
  name: string,
  parentId: string | undefined,
  accessToken: string,
): Promise<string> {
  const metadata: Record<string, any> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  const data = await driveRequest(
    `${DRIVE_API}/files`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    },
    accessToken,
  );

  return data.id as string;
}

/**
 * Find an existing folder by name (under an optional parent) or create it.
 * Idempotent – safe to call multiple times.
 */
export async function createFolderIfMissing(
  name: string,
  parentId: string | undefined,
  accessToken: string,
): Promise<string> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const data = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { method: 'GET' },
    accessToken,
  );

  if (data.files && data.files.length > 0) {
    return data.files[0].id as string;
  }

  return createFolder(name, parentId, accessToken);
}

/**
 * Build the full Docdril Storage → Docspace → {subfolders} hierarchy.
 * Saves folder IDs to the config.
 */
export async function initializeFolderStructure(accessToken: string): Promise<GoogleDriveFolderMap> {
  // Root: "Docdril Storage"
  const rootId = await createFolderIfMissing('Docdril Storage', undefined, accessToken);
  // Sub-root: "Docspace"
  const docspaceId = await createFolderIfMissing('Docspace', rootId, accessToken);

  const folderMap: GoogleDriveFolderMap = { docspace: docspaceId };

  for (const { key, name } of FOLDER_STRUCTURE) {
    folderMap[key] = await createFolderIfMissing(name, docspaceId, accessToken);
  }

  return folderMap;
}

// ─── File operations ──────────────────────────────────────────────────────────

/**
 * Upload a small file using the multipart upload method (≤ ~5 MB).
 * Returns the Drive file metadata.
 */
export async function uploadFileSimple(
  fileBuffer: Uint8Array,
  name: string,
  mimeType: string,
  folderId: string,
  accessToken: string,
): Promise<{ id: string; name: string; webViewLink: string; webContentLink: string }> {
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const boundary = 'docspace_gdrive_boundary';

  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(prefix.byteLength + fileBuffer.byteLength + suffix.byteLength);
  body.set(prefix, 0);
  body.set(fileBuffer, prefix.byteLength);
  body.set(suffix, prefix.byteLength + fileBuffer.byteLength);

  const data = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body: body as unknown as BodyInit,
    },
    accessToken,
  );

  return data;
}

/**
 * Create a direct resumable upload session with Google Drive.
 * Passes the client's Origin so Google Drive enables CORS for direct browser PUT uploads.
 * Returns the session URI (uploadUrl).
 */
export async function createDriveResumableSession(
  name: string,
  mimeType: string,
  size: number,
  folderId: string,
  accessToken: string,
  origin?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Upload-Content-Type': mimeType,
    'X-Upload-Content-Length': String(size),
  };
  if (origin) {
    headers['Origin'] = origin;
  }

  const initRes = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, parents: [folderId] }),
    },
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Failed to initiate resumable upload session: ${err}`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned from Drive API');
  return uploadUrl;
}

/**
 * Upload a large file using the resumable upload method (server buffer).
 * Returns the Drive file metadata.
 */
export async function uploadFileResumable(
  fileBuffer: Uint8Array,
  name: string,
  mimeType: string,
  folderId: string,
  accessToken: string,
): Promise<{ id: string; name: string; webViewLink: string; webContentLink: string }> {
  // Step 1: Initiate resumable upload session
  const initRes = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileBuffer.byteLength),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    },
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Failed to initiate resumable upload: ${err}`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned from Drive API');

  // Step 2: Upload the content
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(fileBuffer.byteLength),
    },
    body: fileBuffer as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Resumable upload failed: ${err}`);
  }

  return uploadRes.json();
}

/**
 * Upload a file to Google Drive, automatically choosing simple vs resumable
 * based on file size (threshold: 5 MB).
 */
export async function uploadFileToDrive(
  fileBuffer: Uint8Array,
  name: string,
  mimeType: string,
  folderId: string,
  accessToken: string,
): Promise<{ id: string; name: string; webViewLink: string; webContentLink: string }> {
  const RESUMABLE_THRESHOLD = 5 * 1024 * 1024; // 5 MB
  if (fileBuffer.byteLength > RESUMABLE_THRESHOLD) {
    return uploadFileResumable(fileBuffer, name, mimeType, folderId, accessToken);
  }
  return uploadFileSimple(fileBuffer, name, mimeType, folderId, accessToken);
}

/** Delete a file from Google Drive. */
export async function deleteFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Failed to delete Drive file: ${err}`);
  }
}

/** Get metadata for a Drive file. */
export async function getFileMetadata(
  fileId: string,
  accessToken: string,
): Promise<{ id: string; name: string; mimeType: string; size: string; webViewLink: string; webContentLink?: string }> {
  return driveRequest(
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,webViewLink,webContentLink`,
    { method: 'GET' },
    accessToken,
  );
}

/** List files inside a Drive folder. */
export async function listFiles(
  folderId: string,
  accessToken: string,
): Promise<{ id: string; name: string; mimeType: string; size: string; webViewLink: string }[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const data = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,webViewLink)&pageSize=100`,
    { method: 'GET' },
    accessToken,
  );
  return data.files ?? [];
}

/**
 * Return a readable stream for a Drive file (for download proxying).
 * Caller is responsible for piping the response body.
 */
export async function streamFile(fileId: string, accessToken: string): Promise<Response> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to stream Drive file: ${err}`);
  }
  return res;
}

// ─── Storage Quota & Folder Management ───────────────────────────────────────

export interface DriveStorageQuota {
  usageBytes: number;
  limitBytes: number | null; // null if unlimited (Google Workspace)
  usageInDriveBytes: number;
  usageInTrashBytes: number;
  user?: {
    displayName?: string;
    emailAddress?: string;
    photoLink?: string;
  };
}

/**
 * Fetch storage quota from Google Drive (about.get).
 */
export async function getDriveStorageQuota(accessToken: string): Promise<DriveStorageQuota> {
  const data = await driveRequest(
    `${DRIVE_API}/about?fields=storageQuota,user`,
    { method: 'GET' },
    accessToken,
  );

  const q = data.storageQuota || {};
  return {
    usageBytes: parseInt(q.usage || '0', 10),
    limitBytes: q.limit ? parseInt(q.limit, 10) : null,
    usageInDriveBytes: parseInt(q.usageInDrive || '0', 10),
    usageInTrashBytes: parseInt(q.usageInDriveTrash || '0', 10),
    user: data.user ? {
      displayName: data.user.displayName,
      emailAddress: data.user.emailAddress,
      photoLink: data.user.photoLink,
    } : undefined,
  };
}

export interface DriveFolderInfo {
  id: string;
  name: string;
  parents?: string[];
  webViewLink?: string;
  createdTime?: string;
  isStandard?: boolean;
}

/**
 * Lists all folders created in Google Drive under Docspace root or accessible.
 */
export async function listDriveFolders(accessToken: string): Promise<DriveFolderInfo[]> {
  const config = await getGDriveConfig();
  const rootId = config?.rootFolderId;

  // Query folders not trashed
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const data = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents,webViewLink,createdTime)&pageSize=100&orderBy=name`,
    { method: 'GET' },
    accessToken,
  );

  const standardIds = new Set(Object.values(config?.folders || {}));
  if (rootId) standardIds.add(rootId);

  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    parents: f.parents,
    webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
    createdTime: f.createdTime,
    isStandard: standardIds.has(f.id),
  }));
}

/**
 * Create a new custom folder in Google Drive.
 */
export async function createCustomFolder(
  name: string,
  parentId?: string,
  accessToken?: string,
): Promise<DriveFolderInfo> {
  const token = accessToken || await getGDriveAccessToken();
  const config = await getGDriveConfig();
  
  // Default to Docspace root folder if not specified
  const effectiveParentId = parentId || config?.folders?.docspace || config?.rootFolderId;

  const metadata: Record<string, any> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (effectiveParentId) metadata.parents = [effectiveParentId];

  const data = await driveRequest(
    `${DRIVE_API}/files?fields=id,name,parents,webViewLink,createdTime`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    },
    token,
  );

  return {
    id: data.id,
    name: data.name,
    parents: data.parents,
    webViewLink: data.webViewLink || `https://drive.google.com/drive/folders/${data.id}`,
    createdTime: data.createdTime,
    isStandard: false,
  };
}
