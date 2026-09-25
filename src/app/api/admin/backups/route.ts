import { NextRequest, NextResponse } from 'next/server';
import { 
  createBackup, 
  listBackups, 
  restoreBackup, 
  deleteBackup 
} from '@/lib/storage/backup';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers, listWorkspacesForUser } from '@/lib/services/workspace';

async function checkBackupAccess(userId: string, userRole: string, requireWrite = false): Promise<boolean> {
  if (userRole === 'admin') return true;
  try {
    const workspaces = await listWorkspacesForUser(userId);
    for (const ws of workspaces) {
      const members = await listWorkspaceMembers(ws.id);
      const m = members.find(mem => mem.userId === userId);
      if (m) {
        if (m.role === 'owner' || m.role === 'manager') return true;
        const sp = m.tabPermissions?.['settings'];
        const st = m.tabPermissions?.['storage'];
        if (requireWrite) {
          if (sp === 'full' || st === 'full') return true;
        } else {
          if (sp && sp !== 'none') return true;
          if (st && st !== 'none') return true;
        }
      }
    }
  } catch {}
  return false;
}

// GET: List all backups
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkBackupAccess(user.id, user.role, false);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Access required' }, { status: 403 });
    }

    const backups = await listBackups();
    return NextResponse.json(backups);
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new backup
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkBackupAccess(user.id, user.role, true);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Access required' }, { status: 403 });
    }

    const backupFilename = await createBackup();
    return NextResponse.json({ success: true, filename: backupFilename });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Backup creation failed' }, { status: 500 });
  }
}

// PUT: Restore a backup from filename
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkBackupAccess(user.id, user.role, true);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Access required' }, { status: 403 });
    }

    const body = await request.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 });
    }

    await restoreBackup(filename);
    return NextResponse.json({ success: true, message: 'Storage restored successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Backup restoration failed' }, { status: 500 });
  }
}

// DELETE: Delete a backup file
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await checkBackupAccess(user.id, user.role, true);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json({ error: 'Missing filename parameter' }, { status: 400 });
    }

    await deleteBackup(filename);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Backup deletion failed' }, { status: 500 });
  }
}
