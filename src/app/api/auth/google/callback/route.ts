/**
 * /api/auth/google/callback
 *
 * OAuth 2.0 callback handler for the CENTRAL Google Drive storage connection.
 * This is NOT for Firebase user authentication — do not confuse with /api/auth/google.
 *
 * Flow:
 *   1. Google redirects here after admin grants Drive access.
 *   2. We exchange the code for tokens.
 *   3. Refresh token stored server-side (Firestore / local) — never in browser.
 *   4. Folder structure is initialized.
 *   5. Admin is redirected to /settings?tab=storage&status=connected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  exchangeCodeForTokens,
  saveGDriveConfig,
  initializeFolderStructure,
} from '@/lib/storage/google-drive';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // ── User denied consent ───────────────────────────────────────────────────
  if (error) {
    console.error('[GDrive OAuth] User denied or error:', error);
    return NextResponse.redirect(`${base}/settings?tab=storage&status=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${base}/settings?tab=storage&status=error&reason=no_code`);
  }

  // ── Verify caller is a system admin ──────────────────────────────────────
  const sessionUser = await getCurrentUser(req);
  if (!sessionUser || sessionUser.role !== 'admin') {
    return NextResponse.redirect(`${base}/settings?tab=storage&status=error&reason=unauthorized`);
  }

  try {
    // ── Exchange code for tokens ──────────────────────────────────────────
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      // This usually happens if the user has already granted access before
      // and `prompt=consent` was not set. Advise reconnecting.
      return NextResponse.redirect(
        `${base}/settings?tab=storage&status=error&reason=no_refresh_token`,
      );
    }

    // ── Initialize folder structure in Drive ─────────────────────────────
    const folderMap = await initializeFolderStructure(tokens.access_token);

    // ── Persist config server-side ────────────────────────────────────────
    await saveGDriveConfig({
      connected:          true,
      status:             'connected',
      connectedAt:        new Date().toISOString(),
      connectedByEmail:   sessionUser.email,
      connectedByUserId:  sessionUser.id,
      rootFolderId:       folderMap.docspace,
      folders:            folderMap,
      refreshToken:       tokens.refresh_token,
      lastVerifiedAt:     new Date().toISOString(),
    });

    return NextResponse.redirect(`${base}/settings?tab=storage&status=connected`);
  } catch (err: any) {
    console.error('[GDrive OAuth] Callback error:', err);
    return NextResponse.redirect(
      `${base}/settings?tab=storage&status=error&reason=${encodeURIComponent(err.message ?? 'unknown')}`,
    );
  }
}
