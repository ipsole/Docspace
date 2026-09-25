import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listConversations, createChannel, createGroup, getOrCreateDM } from '@/lib/services/chat';

// GET: Retrieve all conversations for the authenticated user in a workspace
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

    const convos = await listConversations(workspaceId, user.id);
    return NextResponse.json(convos);
  } catch (error: any) {
    console.error('Chat GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new channel, group chat, or start a DM in a workspace
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, name, isGroup, type, participants, description, clientId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Resolve creation type. If client sent type, use it. Otherwise fallback.
    // If type is not sent: if isGroup is true, previously it created a channel.
    // But now if it's sent from our new form, type will be 'channel' or 'group'.
    const resolvedType = type || (isGroup ? 'channel' : 'direct');

    if (resolvedType === 'channel') {
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
      }
      const channel = await createChannel(workspaceId, name, user.id, description, clientId);
      return NextResponse.json(channel, { status: 201 });
    } else if (resolvedType === 'group') {
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
      }
      const groupParticipants = participants || [];
      const group = await createGroup(workspaceId, name, user.id, groupParticipants, description, clientId);
      return NextResponse.json(group, { status: 201 });
    } else {
      // Create or get DM
      if (!participants || !Array.isArray(participants) || participants.length === 0) {
        return NextResponse.json({ error: 'DM participant is required' }, { status: 400 });
      }
      const otherParticipantId = participants[0];
      const dm = await getOrCreateDM(workspaceId, user.id, otherParticipantId);
      return NextResponse.json(dm, { status: 201 });
    }
  } catch (error: any) {
    console.error('Chat POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
