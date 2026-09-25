import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { 
  createJoinRequest, 
  listJoinRequests, 
  resolveJoinRequest, 
  listWorkspaceMembers 
} from '@/lib/services/workspace';

// Helper to check owner/admin workspace role
async function isUserWorkspaceAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const members = await listWorkspaceMembers(workspaceId);
  const member = members.find(m => m.userId === userId);
  return !!member && (member.role === 'owner' || member.role === 'admin');
}

// GET: List all join requests for a workspace (restricted to owner/admin)
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

    if (!(await isUserWorkspaceAdmin(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const requests = await listJoinRequests(workspaceId);
    return NextResponse.json(requests);
  } catch (error: any) {
    console.error('JoinRequests GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Submit a request to join a workspace
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Check if user is already a member
    const members = await listWorkspaceMembers(workspaceId);
    if (members.some(m => m.userId === user.id)) {
      return NextResponse.json({ error: 'You are already a member of this workspace' }, { status: 400 });
    }

    const req = await createJoinRequest(workspaceId, user.id);
    return NextResponse.json(req, { status: 201 });
  } catch (error: any) {
    console.error('JoinRequests POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Approve or reject a join request (restricted to owner/admin)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, targetUserId, action } = body; // action is 'approve' or 'reject'

    if (!workspaceId || !targetUserId || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
    }

    if (!(await isUserWorkspaceAdmin(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await resolveJoinRequest(workspaceId, targetUserId, action);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('JoinRequests PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
