/**
 * /api/storage/google/connect
 *
 * Admin-only endpoint that builds the Google OAuth authorization URL and
 * returns it to the frontend. The frontend then redirects the browser there
 * to start the OAuth consent flow for the central Drive account.
 *
 * GET → { authUrl: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // ── Auth guard: must be a system admin ────────────────────────────────────
  const user = await getCurrentUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized — system admin required' }, { status: 403 });
  }

  const clientId    = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Google Drive OAuth credentials not configured on server' },
      { status: 500 },
    );
  }

  // A simple random state token to prevent CSRF — not stored server-side for
  // now (stateless), but can be extended to use a signed JWT / Firestore doc.
  const state = Buffer.from(
    JSON.stringify({ ts: Date.now(), uid: user.id }),
  ).toString('base64url');

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/drive.file',
    access_type:   'offline',
    prompt:        'consent',   // force refresh_token to be returned every time
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.json({ authUrl });
}
