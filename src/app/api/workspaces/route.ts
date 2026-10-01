import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createWorkspace, listWorkspacesForUser, deleteWorkspace, listWorkspaceMembers } from '@/lib/services/workspace';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaces = await listWorkspacesForUser(user.id);
    return NextResponse.json(workspaces);
  } catch (error: any) {
    console.error('Workspaces GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Only administrators can create workspaces' }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }

    const workspace = await createWorkspace(name.trim(), user.id);
    return NextResponse.json(workspace, { status: 201 });
  } catch (error: any) {
    console.error('Workspaces POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a workspace (restricted to workspace owners or system admins)
export async function DELETE(request: NextRequest) {
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

    // Check if user is system admin or workspace owner
    const members = await listWorkspaceMembers(workspaceId);
    const currentMember = members.find(m => m.userId === user.id);
    const isAuthorized = user.role === 'admin' || (currentMember && currentMember.role === 'owner');

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: Only workspace owners or administrators can delete workspaces' }, { status: 403 });
    }

    await deleteWorkspace(workspaceId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Workspaces DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 555 });
  }
}
