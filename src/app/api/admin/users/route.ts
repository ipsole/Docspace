import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { 
  listUsers, 
  updateUser, 
  deleteUser, 
  STORAGE_ROOT 
} from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { logInfo, logError } from '@/lib/storage/logger';

// GET: List all users with full detail (restricted to Admin)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const users = await listUsers();
    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update user role or disabled status (restricted to Admin)
export async function PATCH(request: NextRequest) {
  try {
    const adminUser = await getCurrentUser(request);
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, role, disabled } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (userId === adminUser.id) {
      return NextResponse.json({ error: 'Cannot update your own admin role or status' }, { status: 400 });
    }

    const updates: any = {};
    if (role !== undefined) {
      if (['admin', 'user'].includes(role)) {
        updates.role = role;
      }
    }
    if (disabled !== undefined) {
      updates.disabled = !!disabled;

      // If disabling a user, terminate all their sessions
      if (disabled) {
        try {
          const sessionsPath = path.join(STORAGE_ROOT, 'sessions');
          const files = await fs.readdir(sessionsPath);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const fPath = path.join(sessionsPath, file);
              const content = await fs.readFile(fPath, 'utf-8');
              const session = JSON.parse(content);
              if (session.userId === userId) {
                await fs.unlink(fPath);
              }
            }
          }
        } catch (e) {
          // Ignore session deletion failures
        }
      }
    }

    const updated = await updateUser(userId, updates);
    await logInfo('ADMIN', `User profile updated by Admin (${adminUser.username}): ${updated.username}`, { userId, updates });

    return NextResponse.json(updated);

  } catch (error: any) {
    await logError('ADMIN', 'Admin user update failed', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a user completely (restricted to Admin)
export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await getCurrentUser(request);
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    if (!targetUserId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (targetUserId === adminUser.id) {
      return NextResponse.json({ error: 'Cannot delete your own admin account' }, { status: 400 });
    }

    // Delete user sessions first
    try {
      const sessionsPath = path.join(STORAGE_ROOT, 'sessions');
      const files = await fs.readdir(sessionsPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const fPath = path.join(sessionsPath, file);
          const content = await fs.readFile(fPath, 'utf-8');
          const session = JSON.parse(content);
          if (session.userId === targetUserId) {
            await fs.unlink(fPath);
          }
        }
      }
    } catch {}

    await deleteUser(targetUserId);
    await logInfo('ADMIN', `User deleted by Admin: ${targetUserId}`, { targetUserId });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    await logError('ADMIN', 'Admin user deletion failed', { error: error.message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
