import { NextRequest, NextResponse } from 'next/server';
import { loadConversation, saveConversation, deleteConversation, saveMessages } from '@/lib/storage/storage';
import { Conversation } from '@/lib/storage/models';
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
    const { chatId, action, value } = body;

    if (!chatId || !action) {
      return NextResponse.json({ error: 'Missing chatId or action' }, { status: 400 });
    }

    const convo = await loadConversation(chatId);
    if (!convo) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Verify workspace membership
    const workspaceMembers = await listWorkspaceMembers(convo.workspaceId);
    const isWorkspaceMember = workspaceMembers.some(m => m.userId === user.id);
    if (!isWorkspaceMember) {
      return NextResponse.json({ error: 'Forbidden: You are not a member of this workspace' }, { status: 403 });
    }

    // If it's a DM, ensure the user is a participant
    if (!convo.isChannel && !convo.participants.includes(user.id)) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant in this DM' }, { status: 403 });
    }

    const memberInfo = workspaceMembers.find(m => m.userId === user.id);
    const isWorkspaceAdmin = memberInfo && (memberInfo.role === 'owner' || memberInfo.role === 'admin');
    const isCreator = convo.creatorId ? convo.creatorId === user.id : (convo.participants[0] === user.id);
    const isAuthorizedToDeleteOrClear = (convo.isChannel || convo.isGroup)
      ? (isCreator || isWorkspaceAdmin)
      : convo.participants.includes(user.id);

    let updatedConvo: Conversation = { ...convo };

    switch (action) {
      case 'pin':
        if (!convo.pinnedBy.includes(user.id)) {
          updatedConvo.pinnedBy = [...convo.pinnedBy, user.id];
        }
        break;
      case 'unpin':
        updatedConvo.pinnedBy = convo.pinnedBy.filter(id => id !== user.id);
        break;
      case 'archive':
        if (!convo.archivedBy.includes(user.id)) {
          updatedConvo.archivedBy = [...convo.archivedBy, user.id];
        }
        break;
      case 'unarchive':
        updatedConvo.archivedBy = convo.archivedBy.filter(id => id !== user.id);
        break;
      case 'rename':
        if (!convo.isChannel && !convo.isGroup) {
          return NextResponse.json({ error: 'Cannot rename DMs' }, { status: 400 });
        }
        if (!value || value.trim().length === 0) {
          return NextResponse.json({ error: 'New name is required' }, { status: 400 });
        }
        updatedConvo.name = value.trim();
        break;
      case 'add_participant':
        if (!convo.isChannel && !convo.isGroup) {
          return NextResponse.json({ error: 'Cannot add participants to DMs' }, { status: 400 });
        }
        if (!value || typeof value !== 'string') {
          return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 });
        }
        if (!convo.participants.includes(value)) {
          updatedConvo.participants = [...convo.participants, value];
        }
        break;
      case 'remove_participant':
        if (!convo.isChannel && !convo.isGroup) {
          return NextResponse.json({ error: 'Cannot remove participants from DMs' }, { status: 400 });
        }
        if (!value || typeof value !== 'string') {
          return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 });
        }
        updatedConvo.participants = convo.participants.filter(id => id !== value);
        break;
      case 'update_avatar':
        if (!convo.isChannel && !convo.isGroup) {
          return NextResponse.json({ error: 'Cannot update DM avatars' }, { status: 400 });
        }
        updatedConvo.avatar = value ? value.trim() : null;
        break;
      case 'update_description':
        if (!convo.isChannel && !convo.isGroup) {
          return NextResponse.json({ error: 'Cannot update DM descriptions' }, { status: 400 });
        }
        updatedConvo.description = value ? value.trim() : null;
        break;
      case 'set_client':
        if (!convo.isChannel && !convo.isGroup) {
          return NextResponse.json({ error: 'Cannot update DM client linkage' }, { status: 400 });
        }
        updatedConvo.clientId = value && value !== 'none' ? String(value).trim() : null;
        break;
      case 'clear':
        if (!isAuthorizedToDeleteOrClear) {
          return NextResponse.json({ error: 'Forbidden: You are not authorized to clear this conversation' }, { status: 403 });
        }
        await saveMessages(chatId, []);
        updatedConvo.lastMessage = null;
        chatEmitter.emit('chat_cleared', { chatId });
        break;
      case 'delete':
        if (!isAuthorizedToDeleteOrClear) {
          return NextResponse.json({ error: 'Forbidden: You are not authorized to delete this conversation' }, { status: 403 });
        }
        await deleteConversation(chatId);
        const deleteTargetIds = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
        chatEmitter.emit('chat_deleted', { chatId, participants: deleteTargetIds });
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (action !== 'delete') {
      updatedConvo.updatedAt = new Date().toISOString();
      await saveConversation(updatedConvo);
      
      const targetIds = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
      chatEmitter.emit('chat_updated', { ...updatedConvo, participants: targetIds });
      return NextResponse.json(updatedConvo);
    }
  } catch (error: any) {
    console.error('Chat action error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
