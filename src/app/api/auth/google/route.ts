import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAuth } from '@/lib/firebase/admin';
import { listUsers, updateUser } from '@/lib/storage/storage';
import { startSession } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing Google ID token' }, { status: 400 });
    }

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
      await logError('AUTH', `Unauthorized Google login attempt: ${email}`, { email });
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
    await logInfo('AUTH', `Google login success: ${userToLogin.username} (${email})`, { 
      userId: userToLogin.id, 
      username: userToLogin.username, 
      email 
    });

    const { passwordHash: _, ...userWithoutHash } = userToLogin;
    return NextResponse.json(userWithoutHash);

  } catch (error: any) {
    console.error('Google Auth error:', error);
    await logError('AUTH', 'Google login error', { error: error.message });
    return NextResponse.json({ error: error.message || 'Authentication failed' }, { status: 500 });
  }
}
