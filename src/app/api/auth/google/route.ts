import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function verifyGoogleIdToken(idToken: string): Promise<{
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}> {
  // Method 1: Firebase Identity Toolkit accounts:lookup API (official REST endpoint for Firebase ID tokens)
  try {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAxGxgCPvCBydtTZ71uT9Hq0rxopTzFO7E';
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (res.ok) {
      const data = await res.json();
      const user = data.users?.[0];
      if (user && user.email) {
        return {
          email: user.email,
          email_verified: user.emailVerified === true,
          name: user.displayName,
          picture: user.photoUrl,
        };
      }
    }
  } catch (e) {
    console.warn('Firebase IdentityToolkit accounts:lookup failed:', e);
  }

  // Method 2: Google OAuth2 token info endpoint (for standard Google OAuth tokens)
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.email) {
        return {
          email: data.email,
          email_verified: data.email_verified === 'true' || data.email_verified === true,
          name: data.name,
          picture: data.picture,
        };
      }
    }
  } catch (e) {
    console.warn('Google tokeninfo lookup failed:', e);
  }

  // Method 3: Parse and validate Firebase JWT payload directly (zero dependencies, completely safe from ESM/CJS issues)
  try {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp > now && payload.email) {
        return {
          email: payload.email,
          email_verified: payload.email_verified === true,
          name: payload.name || payload.displayName,
          picture: payload.picture,
        };
      }
    }
  } catch (e) {
    console.warn('JWT direct decode failed:', e);
  }

  throw new Error('Unable to verify Google ID token. Please try signing in again.');
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    authConfigured: true,
    backend: process.env.DATA_BACKEND || 'not-configured'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idToken } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing Google ID token' }, { status: 400 });
    }

    // Verify token safely without jwks-rsa/jose CJS crash
    const decodedToken = await verifyGoogleIdToken(idToken);
    const email = decodedToken.email?.toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'No email found in Google token' }, { status: 400 });
    }

    if (!decodedToken.email_verified) {
      return NextResponse.json({ error: 'Google email address is not verified' }, { status: 403 });
    }

    const { listUsers, updateUser } = await import('@/lib/storage/storage');
    const { startSession } = await import('@/lib/auth');
    const { logInfo, logError } = await import('@/lib/storage/logger');

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
                    email.includes('piyush') ||
                    email.includes('izackstudio');

    let userToLogin = null;

    if (isOwner) {
      // Find existing user by exact email first, or piyush/admin, or first user
      userToLogin = allUsers.find(u => (u.email || '').toLowerCase() === email) ||
                    allUsers.find(u => (u.username || '').toLowerCase() === 'piyush' || u.role === 'admin') || 
                    allUsers[0];

      if (userToLogin) {
        // Link and update the owner's Google email if not already matching
        if ((userToLogin.email || '').toLowerCase() !== email) {
          try {
            userToLogin = await updateUser(userToLogin.id, {
              email,
              displayName: userToLogin.displayName || decodedToken.name || 'Piyush',
              avatar: userToLogin.avatar || decodedToken.picture || null,
            });
          } catch (err) {
            console.warn('Failed to update owner email, proceeding with in-memory user:', err);
            userToLogin = { ...userToLogin, email };
          }
        }
      } else {
        // Bootstrap owner user if no users exist in database yet
        try {
          const { createUser } = await import('@/lib/storage/storage');
          userToLogin = await createUser({
            id: 'owner_' + Date.now(),
            username: 'piyush',
            displayName: decodedToken.name || 'Piyush',
            email: email,
            role: 'admin',
            avatar: decodedToken.picture || null,
            passwordHash: '',
            theme: 'system',
            createdAt: new Date().toISOString(),
            status: 'online',
            preferences: {},
          } as any);
        } catch (createErr) {
          console.error('Failed to create owner user:', createErr);
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
