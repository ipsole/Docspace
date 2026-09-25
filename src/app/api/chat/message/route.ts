import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { loadConversation } from '@/lib/storage/storage';
import { loadMessages, sendMessage, editMessage, deleteMessage, toggleReaction, pinMessage } from '@/lib/services/chat';
import { listWorkspaceMembers, getWorkspace, checkWorkspaceAccess } from '@/lib/services/workspace';

// Helper to check user access to a conversation
async function verifyChatAccess(chatId: string, userId: string, role?: string): Promise<{ authorized: boolean; convo?: any; error?: string }> {
  const convo = await loadConversation(chatId);
  if (!convo) {
    return { authorized: false, error: 'Conversation not found' };
  }

  // System admins have access to all chats
  if (role === 'admin') {
    return { authorized: true, convo };
  }

  // Scoped to workspace: check if user has access to workspace
  const hasAccess = await checkWorkspaceAccess(convo.workspaceId, { id: userId, role });
  if (!hasAccess) {
    return { authorized: false, error: 'Forbidden: You are not a member of this workspace' };
  }

  // Channels, groups or client chats are open to all workspace members. Private 1-on-1 DMs require participant checks.
  if (!convo.isChannel && !convo.isGroup && !convo.clientId && !convo.participants.includes(userId)) {
    return { authorized: false, error: 'Forbidden: You are not a participant in this DM' };
  }

  return { authorized: true, convo };
}

// GET: Load message history for a conversation
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
    }

    const access = await verifyChatAccess(chatId, user.id, user.role);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: access.error?.includes('not found') ? 404 : 403 });
    }

    const messages = await loadMessages(chatId);
    return NextResponse.json(messages);
  } catch (error: any) {
    console.error('Messages GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Send a message in a conversation
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chatId, content, type, attachments, replyTo } = body;

    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
    }

    const access = await verifyChatAccess(chatId, user.id, user.role);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: access.error?.includes('not found') ? 404 : 403 });
    }

    const savedMsg = await sendMessage(
      access.convo.workspaceId,
      chatId,
      user.id,
      content || '',
      type || 'text',
      attachments || [],
      replyTo || null
    );

    return NextResponse.json(savedMsg, { status: 201 });
  } catch (error: any) {
    console.error('Messages POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 550 });
  }
}

// PUT: Edit message content OR toggle message reaction
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chatId, messageId, content, emoji, pinned } = body;

    if (!chatId || !messageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const access = await verifyChatAccess(chatId, user.id, user.role);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: access.error?.includes('not found') ? 404 : 403 });
    }

    let updatedMsg;

    if (pinned !== undefined) {
      // Toggle message pin status (any participant can pin/unpin)
      updatedMsg = await pinMessage(chatId, messageId, !!pinned);
      return NextResponse.json(updatedMsg);
    }

    if (emoji) {
      // Toggle reaction
      updatedMsg = await toggleReaction(chatId, messageId, user.id, emoji);
      return NextResponse.json(updatedMsg);
    }

    if (content !== undefined) {
      // Edit message content - only allowed by original sender!
      const messages = await loadMessages(chatId);
      const target = messages.find(m => m.id === messageId);
      if (!target) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }

      if (target.senderId !== user.id) {
        return NextResponse.json({ error: 'Forbidden: Cannot edit other users\' messages' }, { status: 403 });
      }

      updatedMsg = await editMessage(chatId, messageId, content);
      return NextResponse.json(updatedMsg);
    }

    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  } catch (error: any) {
    console.error('Messages PUT error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a message (redact content and clear attachments)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');
    const messageId = searchParams.get('messageId');

    if (!chatId || !messageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const access = await verifyChatAccess(chatId, user.id, user.role);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: access.error?.includes('not found') ? 404 : 403 });
    }

    const messages = await loadMessages(chatId);
    const target = messages.find(m => m.id === messageId);
    if (!target) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Original sender, System Admin, Workspace Owner/Admin/Manager, or Channel/Group creator can delete messages
    const ws = access.convo.workspaceId ? await getWorkspace(access.convo.workspaceId) : null;
    const workspaceMembers = await listWorkspaceMembers(access.convo.workspaceId);
    const currentMember = workspaceMembers.find(m => m.userId === user.id);
    const isConvoAdmin = access.convo.type !== 'direct' && (
      access.convo.creatorId === user.id || 
      access.convo.members?.[0] === user.id || 
      access.convo.participants?.[0] === user.id
    );
    const isAuthorizedDeleter = 
      target.senderId === user.id || 
      user.role === 'admin' ||
      ws?.ownerId === user.id ||
      (currentMember && (currentMember.role === 'owner' || currentMember.role === 'admin' || currentMember.role === 'manager')) ||
      isConvoAdmin;

    if (!isAuthorizedDeleter) {
      return NextResponse.json({ error: 'Forbidden: Cannot delete this message' }, { status: 403 });
    }

    const completely = searchParams.get('completely') === 'true';
    const updatedMsg = await deleteMessage(chatId, messageId, completely);
    return NextResponse.json(updatedMsg);
  } catch (error: any) {
    console.error('Messages DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
