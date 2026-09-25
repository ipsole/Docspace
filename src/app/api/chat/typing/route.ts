import { NextRequest, NextResponse } from 'next/server';
import { loadConversation } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers } from '@/lib/services/workspace';
import { chatEmitter } from '@/lib/storage/eventEmitter';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chatId, isTyping } = body;

    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
    }

    const convo = await loadConversation(chatId);
    if (!convo) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Verify workspace membership
    const workspaceMembers = await listWorkspaceMembers(convo.workspaceId);
    const isWorkspaceMember = workspaceMembers.some(m => m.userId === user.id);
    if (!isWorkspaceMember) {
      return NextResponse.json({ error: 'Forbidden: You are not a member of this workspace' }, { status: 403 });
    }

    // If DM, ensure user is participant
    if (!convo.isChannel && !convo.participants.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant in this DM' }, { status: 403 });
    }

    // Emit the typing event to participants
    const targetParticipants = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
    
    chatEmitter.emit('typing', {
      chatId,
      userId: user.id,
      username: user.displayName || user.username,
      isTyping: !!isTyping,
      participants: targetParticipants
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Typing indicator error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
