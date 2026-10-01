/**
 * /api/storage/google/folders
 *
 * Folder management for central Google Drive storage.
 *
 * GET    → List all Drive folders under Docspace root (or all folders created)
 * POST   → Create a new custom folder in Google Drive
 * DELETE → Delete a folder (or file) from Google Drive
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getGDriveConfig,
  getGDriveAccessToken,
  listDriveFolders,
  createCustomFolder,
  deleteFile as driveDeleteFile,
} from '@/lib/storage/google-drive';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getGDriveConfig();
    if (!config?.connected) {
      return NextResponse.json({ error: 'Google Drive is not connected' }, { status: 503 });
    }

    const accessToken = await getGDriveAccessToken();
    const folders = await listDriveFolders(accessToken);

    return NextResponse.json({ folders, rootFolderId: config.rootFolderId, standardFolders: config.folders });
  } catch (err: any) {
    console.error('[GDrive Folders GET]', err);
    return NextResponse.json({ error: err.message ?? 'Failed to list folders' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, parentId } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const accessToken = await getGDriveAccessToken();
    const folder = await createCustomFolder(name.trim(), parentId, accessToken);

    return NextResponse.json({ folder, success: true });
  } catch (err: any) {
    console.error('[GDrive Folders POST]', err);
    return NextResponse.json({ error: err.message ?? 'Failed to create folder' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId') || searchParams.get('id');

    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    const config = await getGDriveConfig();
    // Protect core root folders from accidental deletion
    if (folderId === config?.rootFolderId || folderId === config?.folders?.docspace) {
      return NextResponse.json({ error: 'Cannot delete the central Docspace root folder' }, { status: 400 });
    }

    const accessToken = await getGDriveAccessToken();
    await driveDeleteFile(folderId, accessToken);

    return NextResponse.json({ success: true, deletedFolderId: folderId });
  } catch (err: any) {
    console.error('[GDrive Folders DELETE]', err);
    return NextResponse.json({ error: err.message ?? 'Failed to delete folder' }, { status: 500 });
  }
}
