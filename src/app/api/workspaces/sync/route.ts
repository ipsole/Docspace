import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { checkWorkspaceAccess } from '@/lib/services/workspace';
import { getWorkspaceSyncState } from '@/lib/services/syncState';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const hasAccess = await checkWorkspaceAccess(workspaceId, { id: user.id, role: user.role });
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const syncState = await getWorkspaceSyncState(workspaceId);
    return NextResponse.json(syncState || { workspaceId, updatedAt: 0 });
  } catch (error: any) {
    console.error('[Sync Route Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
