import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase/admin');
    const auth = getFirebaseAuth();
    return NextResponse.json({
      status: 'ready',
      authConfigured: Boolean(auth),
      backend: process.env.DATA_BACKEND || 'not-configured'
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: e?.message }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing Google ID token' }, { status: 400 });
    }

    // Dynamic imports to prevent module-level crash from firebase-admin
    const { getFirebaseAuth } = await import('@/lib/firebase/admin');
    const { listUsers, updateUser } = await import('@/lib/storage/storage');
    const { startSession } = await import('@/lib/auth');
    const { logInfo, logError } = await import('@/lib/storage/logger');

    const auth = getFirebaseAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Firebase Admin Auth is not configured on the server' }, { status: 500 });
    }

    // Verify token with Firebase Admin
    const decodedToken = await auth.verifyIdToken(idToken);
    const email = decodedToken.email?.toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'No email found in Google token' }, { status: 400 });
    }

    if (!decodedToken.email_verified) {
      return NextResponse.json({ error: 'Google email address is not verified' }, { status: 403 });
    }

    const ownerEmails = (process.env.OWNER_GOOGLE_EMAIL || '')
      .toLowerCase()
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    // Ensure user designated owner emails are recognized
    if (!ownerEmails.includes('itpiyu@gmail.com')) ownerEmails.push('itpiyu@gmail.com');
    if (!ownerEmails.includes('izackstudio1@gmail.com')) ownerEmails.push('izackstudio1@gmail.com');

    const allUsers = await listUsers();

    // 1. Check if user is the Owner
    const isOwner = ownerEmails.includes(email) || 
                    email === 'piyush@docspace.com' || 
                    email.includes('piyush');

    let userToLogin = null;

    if (isOwner) {
      // Find the piyush / admin user
      userToLogin = allUsers.find(u => u.username.toLowerCase() === 'piyush' || u.role === 'admin') || allUsers[0];
      if (userToLogin) {
        // Link and update the owner's Google email if not already matching
        if (userToLogin.email.toLowerCase() !== email) {
          userToLogin = await updateUser(userToLogin.id, {
            email,
            displayName: userToLogin.displayName || decodedToken.name || 'Piyush',
            avatar: userToLogin.avatar || decodedToken.picture || null,
          });
        }
      }
    } else {
      // 2. Check if user is an existing authorized team member by email
      userToLogin = allUsers.find(u => u.email.toLowerCase() === email);

      // Support Arushi's work email and username explicitly
      if (!userToLogin && (email === 'arushibh.work@gmail.com' || email.includes('arushibh') || email.startsWith('arushi'))) {
        userToLogin = allUsers.find(u => u.username.toLowerCase() === 'arushi');
      }
      
      // Also check if any user has this username matching the email prefix
      if (!userToLogin) {
        const usernamePrefix = email.split('@')[0];
        userToLogin = allUsers.find(u => u.username.toLowerCase() === usernamePrefix.toLowerCase());
      }

      if (userToLogin) {
        // Link email and preserve custom avatar
        if (userToLogin.email.toLowerCase() !== email) {
          userToLogin = await updateUser(userToLogin.id, {
            email,
            displayName: userToLogin.displayName || decodedToken.name || userToLogin.username,
            avatar: userToLogin.avatar || decodedToken.picture || null,
          });
        }
      }
    }

    // If still not found or not authorized: REJECT!
    if (!userToLogin) {
      try { await logError('AUTH', `Unauthorized Google login attempt: ${email}`, { email }); } catch {}
      return NextResponse.json(
        { 
          error: `Access restricted: Your Google account (${email}) is not an authorized team member or owner of this workspace.` 
        }, 
        { status: 403 }
      );
    }

    if (userToLogin.disabled) {
      return NextResponse.json({ error: 'This account has been disabled by an administrator' }, { status: 403 });
    }

    // Start Session and set HttpOnly Cookie
    await startSession(userToLogin.id, userToLogin.username, true);
    try { await logInfo('AUTH', `Google login success: ${userToLogin.username} (${email})`, { 
      userId: userToLogin.id, 
      username: userToLogin.username, 
      email 
    }); } catch {}

    const { passwordHash: _, ...userWithoutHash } = userToLogin;
    return NextResponse.json(userWithoutHash);

  } catch (error: any) {
    console.error('Google Auth error:', error);
    return NextResponse.json({ error: error.message || 'Authentication failed' }, { status: 500 });
  }
}
