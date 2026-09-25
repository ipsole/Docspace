import { NextRequest, NextResponse } from 'next/server';
import { listUsers, updateUser, readUser } from '@/lib/storage/storage';
import { getCurrentUser, hashPassword, verifyPassword } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';

// GET: Retrieve all users (excluding password hashes)
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allUsers = await listUsers();
    
    // Sanitize users
    const sanitizedUsers = allUsers.map(user => {
      const { passwordHash: _, ...rest } = user;
      return rest;
    });

    return NextResponse.json(sanitizedUsers);
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT: Update current user profile or password
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { displayName, email, bio, avatar, status, theme, preferences, oldPassword, newPassword } = body;

    const updates: any = {};

    if (displayName !== undefined) {
      if (displayName.trim().length === 0) {
        return NextResponse.json({ error: 'Display Name cannot be empty' }, { status: 400 });
      }
      updates.displayName = displayName;
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || email.trim().length === 0) {
        return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 });
      }
      updates.email = email.trim();
    }

    if (bio !== undefined) updates.bio = bio;
    if (avatar !== undefined) updates.avatar = avatar;
    if (status !== undefined) {
      if (['online', 'offline', 'away'].includes(status)) {
        updates.status = status;
      }
    }
    if (theme !== undefined) {
      if (['light', 'dark', 'system'].includes(theme)) {
        updates.theme = theme;
      }
    }
    if (preferences !== undefined) updates.preferences = preferences;

    // Handle Password Change
    if (newPassword !== undefined) {
      if (!oldPassword) {
        return NextResponse.json({ error: 'Old password is required to change password' }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
      }

      // Read current user info (with passwordHash)
      const userFull = await readUser(currentUser.id);
      if (!userFull) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Verify old password
      const isOldValid = await verifyPassword(oldPassword, userFull.passwordHash);
      if (!isOldValid) {
        return NextResponse.json({ error: 'Incorrect old password' }, { status: 400 });
      }

      // Hash and update
      updates.passwordHash = await hashPassword(newPassword);
      await logInfo('AUTH', `User changed password: ${currentUser.username}`, { userId: currentUser.id });
    }

    const updatedUser = await updateUser(currentUser.id, updates);
    const { passwordHash: _, ...userWithoutHash } = updatedUser;

    return NextResponse.json(userWithoutHash);

  } catch (error: any) {
    await logError('SYSTEM', 'Update user profile error', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
