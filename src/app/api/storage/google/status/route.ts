/**
 * /api/storage/google/status
 *
 * Returns the current Google Drive connection status (without the refresh token).
 *
 * GET → { connected, status, connectedAt, connectedByEmail, folders, ... }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getGDriveConfig, saveGDriveConfig, getGDriveAccessToken, getDriveStorageQuota } from '@/lib/storage/google-drive';

export async function GET() {
  const config = await getGDriveConfig();

  if (!config || !config.connected) {
    return NextResponse.json({ connected: false, status: config?.status || 'disconnected' });
  }

  // Strip the refresh token — never send it to the browser
  const { refreshToken: _omit, ...safe } = config as any;

  // Try to fetch live quota and user info from Google Drive API
  try {
    const accessToken = await getGDriveAccessToken();
    const quota = await getDriveStorageQuota(accessToken);
    return NextResponse.json({ ...safe, quota });
  } catch (err: any) {
    console.warn('Failed to fetch Drive storage quota:', err.message);
    return NextResponse.json({ ...safe, quotaError: err.message });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { invoiceFolderId, invoiceFolderName } = body;

    const config = await getGDriveConfig();
    if (!config) {
      return NextResponse.json({ error: 'Google Drive configuration not found' }, { status: 404 });
    }

    const updatedConfig = {
      ...config,
      invoiceFolderId: invoiceFolderId ?? config.invoiceFolderId,
      invoiceFolderName: invoiceFolderName ?? config.invoiceFolderName,
    };

    await saveGDriveConfig(updatedConfig);
    const { refreshToken: _omit, ...safe } = updatedConfig as any;
    return NextResponse.json({ ...safe, success: true });
  } catch (err: any) {
    console.error('Failed to update Google Drive status/settings:', err);
    return NextResponse.json({ error: err?.message || 'Failed to update settings' }, { status: 500 });
  }
}
