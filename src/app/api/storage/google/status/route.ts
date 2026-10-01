/**
 * /api/storage/google/status
 *
 * Returns the current Google Drive connection status (without the refresh token).
 *
 * GET → { connected, status, connectedAt, connectedByEmail, folders, ... }
 */

import { NextResponse } from 'next/server';
import { getGDriveConfig, getGDriveAccessToken, getDriveStorageQuota } from '@/lib/storage/google-drive';

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
