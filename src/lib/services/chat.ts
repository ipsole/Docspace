import fs from 'fs/promises';
import path from 'path';
import { Conversation, Message } from '../storage/models';
import { safeReadFile, safeWriteFile, STORAGE_ROOT, enqueueTask, loadConversation, listConversations as storageListConversations } from '../storage/storage';
import { isFirestoreEnabled } from '../storage/firestoreAdapter';
import { listWorkspaceMembers, checkWorkspaceAccess } from './workspace';
import { chatEmitter } from '../storage/eventEmitter';
import { v4 as uuidv4 } from 'uuid';

const CONV_DIR = path.join(STORAGE_ROOT, 'conversations');
const MSG_DIR = path.join(STORAGE_ROOT, 'messages');

// Ensure directories exist
async function ensureDirs() {
  await fs.mkdir(CONV_DIR, { recursive: true });
  await fs.mkdir(MSG_DIR, { recursive: true });
}

export async function listConversations(workspaceId: string, userId: string, role?: string): Promise<Conversation[]> {
  // Check if user is a member of the workspace
  const hasAccess = await checkWorkspaceAccess(workspaceId, { id: userId, role });
  if (!hasAccess) {
    throw new Error('Forbidden: User is not a member of this workspace');
  }

  if (isFirestoreEnabled()) {
    const allConvos = await storageListConversations();
    const convos: Conversation[] = [];
    for (const convo of allConvos) {
      if (convo.workspaceId === workspaceId) {
        const isWorkspaceShared = convo.isChannel || convo.isGroup || Boolean(convo.clientId);
        if (isWorkspaceShared || convo.participants.includes(userId)) {
          convos.push(convo);
        }
      }
    }
    return convos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  await ensureDirs();
  const files = await fs.readdir(CONV_DIR).catch(() => []);
  const convos: Conversation[] = [];

  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('._')) {
      const convo = await loadConversation(file.replace(/\.json$/, ''));
      if (!convo) continue;

      // Auto-migrate legacy conversations without workspaceId to current workspace
      if (!convo.workspaceId && workspaceId) {
        convo.workspaceId = workspaceId;
        await safeWriteFile(path.join(CONV_DIR, file), JSON.stringify(convo, null, 2));
      }

      // Scoped to workspace
      if (convo.workspaceId === workspaceId) {
        // If it is a channel, a group, or linked to a client, it is shared across all workspace members
        // If it is a private DM, user must be a participant
        const isWorkspaceShared = convo.isChannel || convo.isGroup || Boolean(convo.clientId);
        if (isWorkspaceShared || convo.participants.includes(userId)) {
          convos.push(convo);
        }
      }
    }
  }

  return convos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function createChannel(
  workspaceId: string,
  name: string,
  creatorId: string,
  description?: string,
  clientId?: string
): Promise<Conversation> {
  await ensureDirs();

  const id = uuidv4();
  const now = new Date().toISOString();

  // Verify membership
  const workspaceMembers = await listWorkspaceMembers(workspaceId);
  const isMember = workspaceMembers.some(m => m.userId === creatorId);
  if (!isMember) {
    throw new Error('Forbidden: Creator is not a member of this workspace');
  }

  // A channel is visible to all, but initially has the creator as participant
  // (We can auto-join members or just keep participants list for who has open/active tabs)
  const channel: Conversation = {
    id,
    workspaceId,
    name: name.trim(),
    isChannel: true,
    description: description ? description.trim() : null,
    creatorId: creatorId,
    participants: [creatorId],
    pinnedBy: [],
    archivedBy: [],
    createdAt: now,
    updatedAt: now,
    lastMessage: null,
    clientId: clientId || null
  };

  await safeWriteFile(path.join(CONV_DIR, `${id}.json`), JSON.stringify(channel, null, 2));
  await safeWriteFile(path.join(MSG_DIR, `${id}.json`), JSON.stringify([], null, 2));

  // Dispatch live notification to all workspace members
  const memberIds = workspaceMembers.map(m => m.userId);
  chatEmitter.emit('chat_created', { ...channel, participants: memberIds });

  return channel;
}

export async function createGroup(
  workspaceId: string,
  name: string,
  creatorId: string,
  participants: string[] = [],
  description?: string,
  clientId?: string
): Promise<Conversation> {
  await ensureDirs();

  const id = uuidv4();
  const now = new Date().toISOString();

  // Verify membership
  const workspaceMembers = await listWorkspaceMembers(workspaceId);
  const isMember = workspaceMembers.some(m => m.userId === creatorId);
  if (!isMember) {
    throw new Error('Forbidden: Creator is not a member of this workspace');
  }

  // Ensure participants are members of workspace
  const validInvitedIds = participants.filter(pId => workspaceMembers.some(m => m.userId === pId));
  const uniqueParticipants = Array.from(new Set([creatorId, ...validInvitedIds]));

  const group: Conversation = {
    id,
    workspaceId,
    name: name.trim(),
    isChannel: false,
    isGroup: true,
    description: description ? description.trim() : null,
    creatorId: creatorId,
    participants: uniqueParticipants,
    pinnedBy: [],
    archivedBy: [],
    createdAt: now,
    updatedAt: now,
    lastMessage: null,
    clientId: clientId || null
  };

  await safeWriteFile(path.join(CONV_DIR, `${id}.json`), JSON.stringify(group, null, 2));
  await safeWriteFile(path.join(MSG_DIR, `${id}.json`), JSON.stringify([], null, 2));

  // Emit event to workspace members
  const memberIds = workspaceMembers.map(m => m.userId);
  chatEmitter.emit('chat_created', { ...group, participants: memberIds });

  return group;
}

export async function getOrCreateDM(workspaceId: string, participantA: string, participantB: string): Promise<Conversation> {
  await ensureDirs();

  // Verify membership for both
  const workspaceMembers = await listWorkspaceMembers(workspaceId);
  const isMemberA = workspaceMembers.some(m => m.userId === participantA);
  const isMemberB = workspaceMembers.some(m => m.userId === participantB);

  if (!isMemberA || !isMemberB) {
    throw new Error('Forbidden: Participants must be members of the workspace');
  }

  const allConvos = await listConversations(workspaceId, participantA);
  
  // Look for existing 1-on-1 DM
  const existing = allConvos.find(c => 
    !c.isChannel && 
    c.participants.length === 2 && 
    c.participants.includes(participantA) && 
    c.participants.includes(participantB)
  );

  if (existing) {
    return existing;
  }

  // Create new DM
  const id = uuidv4();
  const now = new Date().toISOString();

  const dm: Conversation = {
    id,
    workspaceId,
    name: null,
    isChannel: false,
    participants: [participantA, participantB],
    pinnedBy: [],
    archivedBy: [],
    createdAt: now,
    updatedAt: now,
    lastMessage: null
  };

  await safeWriteFile(path.join(CONV_DIR, `${id}.json`), JSON.stringify(dm, null, 2));
  await safeWriteFile(path.join(MSG_DIR, `${id}.json`), JSON.stringify([], null, 2));

  chatEmitter.emit('chat_created', dm);
  return dm;
}

export async function loadMessages(chatId: string): Promise<Message[]> {
  const content = await safeReadFile(path.join(MSG_DIR, `${chatId}.json`));
  if (!content) return [];
  try {
    return JSON.parse(content) as Message[];
  } catch {
    return [];
  }
}

export async function sendMessage(
  workspaceId: string,
  chatId: string,
  senderId: string,
  content: string,
  type: Message['type'] = 'text',
  attachments: Message['attachments'] = [],
  replyTo: string | null = null
): Promise<Message> {
  await ensureDirs();

  // Verify sender membership in workspace
  const workspaceMembers = await listWorkspaceMembers(workspaceId);
  if (!workspaceMembers.some(m => m.userId === senderId)) {
    throw new Error('Forbidden: Sender is not a member of this workspace');
  }

  // Verify chat exists
  const convoContent = await safeReadFile(path.join(CONV_DIR, `${chatId}.json`));
  if (!convoContent) throw new Error('Conversation not found');
  const convo = JSON.parse(convoContent) as Conversation;

  const id = uuidv4();
  const now = new Date().toISOString();

  const message: Message = {
    id,
    chatId,
    senderId,
    content,
    type,
    createdAt: now,
    editedAt: null,
    deleted: false,
    attachments,
    replyTo,
    reactions: [],
    pinned: false
  };

  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    messages.push(message);
    await safeWriteFile(path.join(MSG_DIR, `${chatId}.json`), JSON.stringify(messages, null, 2));

    // Update conversation summary
    convo.updatedAt = now;
    convo.lastMessage = {
      id,
      senderId,
      content: type === 'attachment' ? 'Attachment' : content,
      createdAt: now
    };
    await safeWriteFile(path.join(CONV_DIR, `${chatId}.json`), JSON.stringify(convo, null, 2));

    // Emit event to all workspace members if it's a channel, or to participants if DM
    const targetParticipants = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
    chatEmitter.emit('message_sent', { message, participants: targetParticipants });

    return message;
  });
}

export async function editMessage(chatId: string, messageId: string, content: string): Promise<Message> {
  const convoContent = await safeReadFile(path.join(CONV_DIR, `${chatId}.json`));
  if (!convoContent) throw new Error('Conversation not found');
  const convo = JSON.parse(convoContent) as Conversation;

  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx === -1) throw new Error('Message not found');

    messages[idx].content = content;
    messages[idx].editedAt = new Date().toISOString();

    await safeWriteFile(path.join(MSG_DIR, `${chatId}.json`), JSON.stringify(messages, null, 2));

    // Update conversation if it was the last message
    if (convo.lastMessage?.id === messageId) {
      convo.lastMessage.content = content;
      await safeWriteFile(path.join(CONV_DIR, `${chatId}.json`), JSON.stringify(convo, null, 2));
    }

    // Emit event
    const workspaceMembers = await listWorkspaceMembers(convo.workspaceId);
    const targetParticipants = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
    chatEmitter.emit('message_updated', { message: messages[idx], participants: targetParticipants });

    return messages[idx];
  });
}

export async function deleteMessage(chatId: string, messageId: string, completely: boolean = false): Promise<Message> {
  const convoContent = await safeReadFile(path.join(CONV_DIR, `${chatId}.json`));
  if (!convoContent) throw new Error('Conversation not found');
  const convo = JSON.parse(convoContent) as Conversation;

  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx === -1) throw new Error('Message not found');

    const targetMsg = { ...messages[idx] };

    if (completely) {
      messages.splice(idx, 1);
    } else {
      messages[idx].content = 'This message was deleted';
      messages[idx].deleted = true;
      messages[idx].attachments = [];
      messages[idx].editedAt = new Date().toISOString();
    }

    await safeWriteFile(path.join(MSG_DIR, `${chatId}.json`), JSON.stringify(messages, null, 2));

    if (convo.lastMessage?.id === messageId) {
      if (completely) {
        if (messages.length > 0) {
          const newLast = messages[messages.length - 1];
          convo.lastMessage = {
            id: newLast.id,
            senderId: newLast.senderId,
            content: newLast.deleted ? 'This message was deleted' : newLast.content,
            createdAt: newLast.createdAt
          };
        } else {
          convo.lastMessage = null;
        }
      } else {
        convo.lastMessage.content = 'This message was deleted';
      }
      await safeWriteFile(path.join(CONV_DIR, `${chatId}.json`), JSON.stringify(convo, null, 2));
    }

    const workspaceMembers = await listWorkspaceMembers(convo.workspaceId);
    const targetParticipants = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
    
    if (completely) {
      chatEmitter.emit('message_deleted', { messageId, chatId, participants: targetParticipants });
    } else {
      chatEmitter.emit('message_updated', { message: messages[idx], participants: targetParticipants });
    }

    return targetMsg;
  });
}

export async function toggleReaction(chatId: string, messageId: string, userId: string, emoji: string): Promise<Message> {
  const convoContent = await safeReadFile(path.join(CONV_DIR, `${chatId}.json`));
  if (!convoContent) throw new Error('Conversation not found');
  const convo = JSON.parse(convoContent) as Conversation;

  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx === -1) throw new Error('Message not found');

    const msg = messages[idx];
    msg.reactions = msg.reactions || [];

    const existingIdx = msg.reactions.findIndex(r => r.userId === userId && r.emoji === emoji);
    if (existingIdx > -1) {
      msg.reactions.splice(existingIdx, 1);
    } else {
      msg.reactions.push({ userId, emoji });
    }

    await safeWriteFile(path.join(MSG_DIR, `${chatId}.json`), JSON.stringify(messages, null, 2));

    const workspaceMembers = await listWorkspaceMembers(convo.workspaceId);
    const targetParticipants = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
    chatEmitter.emit('message_updated', { message: msg, participants: targetParticipants });

    return msg;
  });
}

export async function pinMessage(chatId: string, messageId: string, pinned: boolean): Promise<Message> {
  const convoContent = await safeReadFile(path.join(CONV_DIR, `${chatId}.json`));
  if (!convoContent) throw new Error('Conversation not found');
  const convo = JSON.parse(convoContent) as Conversation;

  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx === -1) throw new Error('Message not found');

    messages[idx].pinned = pinned;

    await safeWriteFile(path.join(MSG_DIR, `${chatId}.json`), JSON.stringify(messages, null, 2));

    const workspaceMembers = await listWorkspaceMembers(convo.workspaceId);
    const targetParticipants = convo.isChannel ? workspaceMembers.map(m => m.userId) : convo.participants;
    chatEmitter.emit('message_updated', { message: messages[idx], participants: targetParticipants });

    return messages[idx];
  });
}
