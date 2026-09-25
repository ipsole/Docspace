import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listEvents, createEvent, deleteEvent } from '@/lib/services/calendar';
import { listWorkspaceMembers, checkWorkspaceAccess } from '@/lib/services/workspace';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string, role?: string): Promise<boolean> {
  return checkWorkspaceAccess(workspaceId, { id: userId, role });
}

// GET: Retrieve all custom calendar events in a workspace
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

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const events = await listEvents(workspaceId);
    return NextResponse.json(events);
  } catch (error: any) {
    console.error('Calendar GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new custom calendar event
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, title, description, startDateTime, endDateTime, type, location, members, clientId } = body;

    if (!workspaceId || !title || !startDateTime || !endDateTime) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const event = await createEvent(workspaceId, {
      title,
      description: description || '',
      startDateTime,
      endDateTime,
      type: type || 'event',
      location: location || '',
      members: members || [],
      clientId: clientId || undefined
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    console.error('Calendar POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a custom calendar event
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const workspaceId = searchParams.get('workspaceId');

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteEvent(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Calendar DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
