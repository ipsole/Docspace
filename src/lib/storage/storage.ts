import fs from 'fs/promises';
import path from 'path';
import { isFirestoreEnabled, firestoreGet, firestoreSet, firestoreDelete, firestoreList, firestoreListDocs } from './firestoreAdapter';

// Define the root storage directory
export const STORAGE_ROOT = path.join(process.cwd(), 'storage');
export const SEED_ROOT = path.join(process.cwd(), 'storage_seed');

const DIRS = [
  'users',
  'sessions',
  'workspaces',
  'clients',
  'groups',
  'teams',
  'projects',
  'tasks',
  'boards',
  'notes',
  'pages',
  'wiki',
  'conversations',
  'messages',
  'attachments',
  'uploads',
  'temp_uploads',
  'avatars',
  'contracts',
  'invoices',
  'payments',
  'crm',
  'calendar',
  'events',
  'notifications',
  'logs',
  'analytics',
  'settings',
  'templates',
  'backups'
];

let dirsCreated = false;

function isJsonDataFile(file: string): boolean {
  return file.endsWith('.json') && !file.startsWith('._');
}

/**
 * Ensures all required storage subdirectories exist.
 */
export async function ensureDirs(): Promise<void> {
  if (dirsCreated) return;
  try {
    for (const dir of DIRS) {
      const dirPath = path.join(STORAGE_ROOT, dir);
      await fs.mkdir(dirPath, { recursive: true });
    }
    dirsCreated = true;
  } catch (err: any) {
    if (err?.code === 'EROFS' || isFirestoreEnabled()) {
      dirsCreated = true;
      return;
    }
    throw err;
  }
}

// Queue of write operations per file path to avoid concurrent write issues and JSON corruption.
const taskQueues = new Map<string, Promise<any>>();

/**
 * Enqueues a task sequentially by key (e.g. file path) to prevent concurrent race conditions.
 */
export async function enqueueTask<T>(key: string, task: () => Promise<T>): Promise<T> {
  const currentPromise = taskQueues.get(key) || Promise.resolve();
  const nextPromise = new Promise<T>((resolve, reject) => {
    currentPromise.then(async () => {
      try {
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }).catch(async () => {
      try {
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
  taskQueues.set(key, nextPromise.then(() => {}, () => {}));
  return nextPromise;
}

/**
 * Helper to extract collection name and document ID from a storage file path
 */
function parseCollectionAndDoc(filePath: string): { collection: string; docId: string } | null {
  try {
    const relative = path.relative(STORAGE_ROOT, filePath);
    const parts = relative.split(path.sep);
    if (parts.length === 2 && parts[1].endsWith('.json') && !parts[1].startsWith('._')) {
      const collection = parts[0];
      const docId = parts[1].replace(/\.json$/, '');
      return { collection, docId };
    }
  } catch {}
  return null;
}

/**
 * Safely writes content to a file atomically by writing to a temporary file first and renaming it.
 * This is queued sequentially per file path to prevent race conditions.
 * If Firestore is enabled, writes to Firestore database concurrently.
 */
export async function safeWriteFile(filePath: string, content: string): Promise<void> {
  const parsed = parseCollectionAndDoc(filePath);
  if (isFirestoreEnabled() && parsed) {
    try {
      const data = JSON.parse(content);
      await firestoreSet(parsed.collection, parsed.docId, data);
    } catch (err) {
      console.error(`Firestore sync write error [${parsed.collection}/${parsed.docId}]:`, err);
    }
    // On Vercel cloud serverless with read-only filesystem, avoid throwing EROFS on local disk writes
    if (process.env.VERCEL) {
      return;
    }
  }

  try {
    await ensureDirs();
    await enqueueTask(filePath, async () => {
      const tempPath = `${filePath}.tmp`;
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
    });
  } catch (err) {
    // If running in a read-only filesystem (like Vercel cloud serverless),
    // local write will fail, but Firestore has already persisted the state.
    if (!isFirestoreEnabled()) {
      throw err;
    }
  }
}

/**
 * Safely reads content from a file.
 * If Firestore is enabled, queries Firestore first for real-time cloud data.
 */
export async function safeReadFile(filePath: string): Promise<string | null> {
  const parsed = parseCollectionAndDoc(filePath);
  if (isFirestoreEnabled() && parsed) {
    try {
      const remoteData = await firestoreGet(parsed.collection, parsed.docId);
      if (remoteData !== null) {
        // If Firestore stored an array wrapped as { items: [...] }, unwrap it transparently
        let dataToReturn = remoteData;
        if (
          remoteData &&
          typeof remoteData === 'object' &&
          !Array.isArray(remoteData) &&
          Array.isArray((remoteData as any).items) &&
          Object.keys(remoteData).length === 1
        ) {
          dataToReturn = (remoteData as any).items;
        }
        return JSON.stringify(dataToReturn);
      }
    } catch (err) {
      console.error(`Firestore sync read error [${parsed.collection}/${parsed.docId}]:`, err);
    }
  }

  try {
    await ensureDirs();
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT' || error.code === 'EROFS') {
      try {
        const rel = path.relative(STORAGE_ROOT, filePath);
        if (!rel.startsWith('..')) {
          const seedPath = path.join(SEED_ROOT, rel);
          return await fs.readFile(seedPath, 'utf-8');
        }
      } catch {}
      return null;
    }
    throw error;
  }
}

/**
 * Deletes a file. No-op if file doesn't exist.
 * If Firestore is enabled, deletes from Firestore database.
 */
export async function safeDeleteFile(filePath: string): Promise<void> {
  const parsed = parseCollectionAndDoc(filePath);
  if (isFirestoreEnabled() && parsed) {
    try {
      await firestoreDelete(parsed.collection, parsed.docId);
    } catch (err) {
      console.error(`Firestore sync delete error [${parsed.collection}/${parsed.docId}]:`, err);
    }
    if (process.env.VERCEL) {
      return;
    }
  }

  try {
    await ensureDirs();
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      if (!isFirestoreEnabled()) {
        throw error;
      }
    }
  }
}

// Interfaces
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  avatar: string | null;
  lastSeen: string;
  status: 'online' | 'offline' | 'away';
  preferences: Record<string, any>;
  theme: 'light' | 'dark' | 'system';
  role: 'admin' | 'user';
  bio: string;
  disabled?: boolean;
}

export interface Session {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
  expiresAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  name: string | null;
  isChannel: boolean;
  isGroup?: boolean;
  avatar?: string | null;
  description?: string | null;
  creatorId?: string | null;
  participants: string[];
  pinnedBy: string[];
  archivedBy: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage: MessageSummary | null;
  clientId?: string | null;
}

export interface MessageSummary {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  path?: string; // absolute or relative path under storage/uploads
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'attachment' | 'system';
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  attachments: MessageAttachment[];
  replyTo: string | null; // message ID
  reactions: { userId: string; emoji: string }[];
  pinned?: boolean;
}

export interface Settings {
  serverName: string;
  allowRegistration: boolean;
  maxUploadSizeMb: number;
  allowedMimeTypes: string[];
}

const DEFAULT_SETTINGS: Settings = {
  serverName: 'DocSpace',
  allowRegistration: true,
  maxUploadSizeMb: 50,
  allowedMimeTypes: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'video/mp4', 'video/webm', 
    'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
    'application/zip', 'application/x-zip-compressed', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
};

// USER DATABASE OPERATIONS
export async function readUser(id: string): Promise<User | null> {
  if (isFirestoreEnabled()) {
    const user = await firestoreGet<User>('users', id);
    if (user) return user;
  }
  const content = await safeReadFile(path.join(STORAGE_ROOT, 'users', `${id}.json`));
  if (!content) return null;
  return JSON.parse(content) as User;
}

export async function readUserByUsername(username: string): Promise<User | null> {
  const users = await listUsers();
  const found = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  return found || null;
}

export async function readUserByEmail(email: string): Promise<User | null> {
  const users = await listUsers();
  const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  return found || null;
}

export async function createUser(user: User): Promise<User> {
  if (isFirestoreEnabled()) {
    await firestoreSet('users', user.id, user);
  }
  const userPath = path.join(STORAGE_ROOT, 'users', `${user.id}.json`);
  await safeWriteFile(userPath, JSON.stringify(user, null, 2));
  return user;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const user = await readUser(id);
  if (!user) throw new Error('User not found');
  const updatedUser = { ...user, ...updates, updatedAt: new Date().toISOString() };
  if (isFirestoreEnabled()) {
    await firestoreSet('users', id, updatedUser);
  }
  const userPath = path.join(STORAGE_ROOT, 'users', `${id}.json`);
  await safeWriteFile(userPath, JSON.stringify(updatedUser, null, 2));
  return updatedUser;
}

export async function deleteUser(id: string): Promise<void> {
  if (isFirestoreEnabled()) {
    await firestoreDelete('users', id);
  }
  await safeDeleteFile(path.join(STORAGE_ROOT, 'users', `${id}.json`));
}

export async function listUsers(): Promise<User[]> {
  if (isFirestoreEnabled()) {
    try {
      const users = await firestoreList<User>('users');
      if (users && users.length > 0) {
        return users.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
      }
    } catch (err) {
      console.warn('Firestore listUsers failed, trying local disk fallback:', err);
    }
  }

  await ensureDirs();
  const dirsToCheck = [
    path.join(STORAGE_ROOT, 'users'),
    path.join(SEED_ROOT, 'users')
  ];
  const userMap = new Map<string, User>();

  for (const dirPath of dirsToCheck) {
    const files = await fs.readdir(dirPath).catch(() => []);
    for (const file of files) {
      if (isJsonDataFile(file)) {
        const content = await safeReadFile(path.join(dirPath, file));
        if (content) {
          try {
            const parsed = JSON.parse(content);
            if (parsed.id && !userMap.has(parsed.id)) {
              userMap.set(parsed.id, parsed);
              // If Firestore is enabled, try syncing local user to Firestore in background
              if (isFirestoreEnabled()) {
                firestoreSet('users', parsed.id, parsed).catch(() => {});
              }
            }
          } catch {
            // ignore corrupted user files
          }
        }
      }
    }
  }

  const users = Array.from(userMap.values());
  return users.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
}

// SESSION DATABASE OPERATIONS
export async function createSession(session: Session): Promise<Session> {
  const sessionPath = path.join(STORAGE_ROOT, 'sessions', `${session.id}.json`);
  await safeWriteFile(sessionPath, JSON.stringify(session, null, 2));
  return session;
}

export async function readSession(id: string): Promise<Session | null> {
  const content = await safeReadFile(path.join(STORAGE_ROOT, 'sessions', `${id}.json`));
  if (!content) return null;
  const session = JSON.parse(content) as Session;
  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    await deleteSession(id);
    return null;
  }
  return session;
}

export async function deleteSession(id: string): Promise<void> {
  await safeDeleteFile(path.join(STORAGE_ROOT, 'sessions', `${id}.json`));
}

export async function cleanExpiredSessions(): Promise<void> {
  if (isFirestoreEnabled()) {
    const sessions = await firestoreListDocs<Session>('sessions');
    const now = new Date();
    for (const doc of sessions) {
      if (!doc.data || !doc.data.expiresAt || new Date(doc.data.expiresAt) < now) {
        await firestoreDelete('sessions', doc.id);
      }
    }
    return;
  }

  await ensureDirs();
  const dirPath = path.join(STORAGE_ROOT, 'sessions');
  const files = await fs.readdir(dirPath).catch(() => []);
  const now = new Date();
  for (const file of files) {
    if (isJsonDataFile(file)) {
      const filePath = path.join(dirPath, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const session = JSON.parse(content) as Session;
          if (new Date(session.expiresAt) < now) {
            await safeDeleteFile(filePath);
          }
        } catch {
          await safeDeleteFile(filePath); // remove malformed session files
        }
      }
    }
  }
}

// CONVERSATION DATABASE OPERATIONS
type StoredConversation = Conversation & {
  isGroup?: boolean;
};

async function resolveDefaultWorkspaceId(): Promise<string | null> {
  if (isFirestoreEnabled()) {
    const docs = await firestoreListDocs('workspaces');
    const wsDoc = docs.find(d => !d.id.endsWith('_members') && !d.id.endsWith('_requests'));
    return wsDoc ? wsDoc.id : null;
  }

  await ensureDirs();
  const dirPath = path.join(STORAGE_ROOT, 'workspaces');
  const files = await fs.readdir(dirPath).catch(() => []);
  const workspaceFile = files.find(file =>
    isJsonDataFile(file) &&
    !file.endsWith('_members.json') &&
    !file.endsWith('_requests.json')
  );

  return workspaceFile ? workspaceFile.replace(/\.json$/, '') : null;
}

async function inferConversationParticipants(conversationId: string): Promise<string[]> {
  const messages = await loadMessages(conversationId);
  return Array.from(new Set(messages.map(message => message.senderId).filter(Boolean)));
}

async function normalizeConversationRecord(raw: StoredConversation): Promise<Conversation> {
  const inferredParticipants = raw.participants?.length
    ? raw.participants
    : await inferConversationParticipants(raw.id);

  const workspaceId = raw.workspaceId || await resolveDefaultWorkspaceId() || '';
  const isGroup = raw.isGroup ?? false;
  const isChannel = typeof raw.isChannel === 'boolean' ? raw.isChannel : false;

  const normalized: Conversation = {
    id: raw.id,
    workspaceId,
    name: raw.name ?? null,
    isChannel,
    isGroup,
    avatar: raw.avatar ?? null,
    description: raw.description ?? null,
    creatorId: raw.creatorId ?? null,
    participants: inferredParticipants,
    pinnedBy: raw.pinnedBy || [],
    archivedBy: raw.archivedBy || [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastMessage: raw.lastMessage || null,
    clientId: raw.clientId ?? null
  };

  return normalized;
}

export async function saveConversation(convo: Conversation): Promise<Conversation> {
  const convoPath = path.join(STORAGE_ROOT, 'conversations', `${convo.id}.json`);
  await safeWriteFile(convoPath, JSON.stringify(convo, null, 2));
  return convo;
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const convoPath = path.join(STORAGE_ROOT, 'conversations', `${id}.json`);
  const content = await safeReadFile(convoPath);
  if (!content) return null;
  const parsed = JSON.parse(content) as StoredConversation;
  const normalized = await normalizeConversationRecord(parsed);

  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    await safeWriteFile(convoPath, JSON.stringify(normalized, null, 2));
  }

  return normalized;
}

export async function deleteConversation(id: string): Promise<void> {
  await safeDeleteFile(path.join(STORAGE_ROOT, 'conversations', `${id}.json`));
  await safeDeleteFile(path.join(STORAGE_ROOT, 'messages', `${id}.json`));
}

export async function listConversations(): Promise<Conversation[]> {
  if (isFirestoreEnabled()) {
    const rawConvos = await firestoreList<StoredConversation>('conversations');
    const normalized = await Promise.all(
      rawConvos.map(async raw => {
        try {
          return await normalizeConversationRecord(raw);
        } catch {
          return null;
        }
      })
    );
    const convos = normalized.filter(Boolean) as Conversation[];
    return convos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  await ensureDirs();
  const dirPath = path.join(STORAGE_ROOT, 'conversations');
  const files = await fs.readdir(dirPath).catch(() => []);
  const convos: Conversation[] = [];
  for (const file of files) {
    if (isJsonDataFile(file)) {
      const content = await safeReadFile(path.join(dirPath, file));
      if (content) {
        try {
          const parsed = JSON.parse(content) as StoredConversation;
          const normalized = await normalizeConversationRecord(parsed);
          if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
            await safeWriteFile(path.join(dirPath, file), JSON.stringify(normalized, null, 2));
          }
          convos.push(normalized);
        } catch {
          // ignore corrupted convo files
        }
      }
    }
  }
  return convos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// MESSAGE DATABASE OPERATIONS
export async function loadMessages(chatId: string): Promise<Message[]> {
  const content = await safeReadFile(path.join(STORAGE_ROOT, 'messages', `${chatId}.json`));
  if (!content) return [];
  try {
    return JSON.parse(content) as Message[];
  } catch {
    return [];
  }
}

export async function saveMessages(chatId: string, messages: Message[]): Promise<void> {
  const messagesPath = path.join(STORAGE_ROOT, 'messages', `${chatId}.json`);
  await safeWriteFile(messagesPath, JSON.stringify(messages, null, 2));
}

export async function appendMessage(chatId: string, message: Message): Promise<Message> {
  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    messages.push(message);
    await saveMessages(chatId, messages);

    // Update conversation lastMessage & updatedAt
    const convo = await loadConversation(chatId);
    if (convo) {
      convo.updatedAt = message.createdAt;
      convo.lastMessage = {
        id: message.id,
        senderId: message.senderId,
        content: message.type === 'attachment' ? 'Attachment' : message.content,
        createdAt: message.createdAt
      };
      await saveConversation(convo);
    }
    return message;
  });
}

export async function editMessage(chatId: string, messageId: string, content: string, attachments?: any[]): Promise<Message> {
  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) throw new Error('Message not found');

    messages[index] = {
      ...messages[index],
      content,
      attachments: attachments !== undefined ? attachments : messages[index].attachments,
      editedAt: new Date().toISOString()
    };

    await saveMessages(chatId, messages);

    // If this was the last message, update conversation summary
    const convo = await loadConversation(chatId);
    if (convo && convo.lastMessage?.id === messageId) {
      convo.lastMessage.content = content;
      await saveConversation(convo);
    }

    return messages[index];
  });
}

export async function deleteMessage(chatId: string, messageId: string): Promise<Message> {
  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) throw new Error('Message not found');

    messages[index] = {
      ...messages[index],
      content: 'This message was deleted',
      attachments: [],
      deleted: true,
      editedAt: new Date().toISOString()
    };

    await saveMessages(chatId, messages);

    // Update conversation lastMessage summary if it was the last message
    const convo = await loadConversation(chatId);
    if (convo && convo.lastMessage?.id === messageId) {
      convo.lastMessage.content = 'This message was deleted';
      await saveConversation(convo);
    }

    return messages[index];
  });
}

export async function updateMessageReactions(
  chatId: string,
  messageId: string,
  userId: string,
  emoji: string
): Promise<Message> {
  return enqueueTask('chat-messages-' + chatId, async () => {
    const messages = await loadMessages(chatId);
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) throw new Error('Message not found');

    const msg = messages[index];
    msg.reactions = msg.reactions || [];

    const existingReactionIndex = msg.reactions.findIndex(r => r.userId === userId && r.emoji === emoji);
    if (existingReactionIndex > -1) {
      // Remove if already exists (toggle)
      msg.reactions.splice(existingReactionIndex, 1);
    } else {
      msg.reactions.push({ userId, emoji });
    }

    await saveMessages(chatId, messages);
    return msg;
  });
}

// SYSTEM SETTINGS OPERATIONS
export async function getSettings(): Promise<Settings> {
  const content = await safeReadFile(path.join(STORAGE_ROOT, 'settings', 'settings.json'));
  if (!content) {
    await saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const settingsPath = path.join(STORAGE_ROOT, 'settings', 'settings.json');
  await safeWriteFile(settingsPath, JSON.stringify(settings, null, 2));
}

// GLOBAL SEARCH OPERATION
export interface SearchResult {
  message: Message;
  chatName: string;
  senderName: string;
}

export async function searchMessages(
  userId: string,
  query: string,
  options?: {
    username?: string;
    chatId?: string;
    dateStart?: string;
    dateEnd?: string;
    hasAttachment?: boolean;
  }
): Promise<SearchResult[]> {
  const convos = await listConversations();
  // Filter conversations where the user is a participant
  const userConvos = convos.filter(c => c.participants.includes(userId));
  const results: SearchResult[] = [];

  const usersList = await listUsers();
  const userMap = new Map(usersList.map(u => [u.id, u]));

  for (const convo of userConvos) {
    if (options?.chatId && convo.id !== options.chatId) continue;

    const messages = await loadMessages(convo.id);
    for (const msg of messages) {
      if (msg.deleted) continue;

      // Filter by text query
      const matchesQuery = !query || msg.content.toLowerCase().includes(query.toLowerCase()) || 
        msg.attachments.some(a => a.name.toLowerCase().includes(query.toLowerCase()));
      if (!matchesQuery) continue;

      // Filter by username/sender
      if (options?.username) {
        const sender = userMap.get(msg.senderId);
        if (!sender || !sender.username.toLowerCase().includes(options.username.toLowerCase())) {
          continue;
        }
      }

      // Filter by attachment presence
      if (options?.hasAttachment && msg.attachments.length === 0) continue;

      // Filter by dates
      if (options?.dateStart && new Date(msg.createdAt) < new Date(options.dateStart)) continue;
      if (options?.dateEnd && new Date(msg.createdAt) > new Date(options.dateEnd)) continue;

      const sender = userMap.get(msg.senderId);
      const senderName = sender ? sender.displayName || sender.username : 'Unknown User';
      let chatName = convo.name || 'Direct Chat';
      if (!convo.isChannel && !convo.isGroup) {
        const otherId = convo.participants.find(p => p !== userId);
        const otherUser = otherId ? userMap.get(otherId) : null;
        chatName = otherUser ? otherUser.displayName || otherUser.username : 'Direct Chat';
      }

      results.push({
        message: msg,
        chatName,
        senderName
      });
    }
  }

  // Sort search results by date descending
  return results.sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime());
}

/**
 * Automatically cleans up abandoned or stale scratch files in storage/temp_uploads.
 * By default, removes items older than 24 hours (86,400,000 ms).
 * If forceAll is true, removes all items regardless of age.
 */
let lastTempCleanupTime = 0;
const TEMP_CLEANUP_THROTTLE_MS = 60 * 60 * 1000; // Throttle background runs to at most once per hour

export async function cleanStaleTempUploads(options?: {
  maxAgeMs?: number;
  forceAll?: boolean;
  throttle?: boolean;
}): Promise<{ cleanedCount: number; reclaimedBytes: number }> {
  const { maxAgeMs = 24 * 60 * 60 * 1000, forceAll = false, throttle = false } = options || {};
  const now = Date.now();

  if (throttle && now - lastTempCleanupTime < TEMP_CLEANUP_THROTTLE_MS) {
    return { cleanedCount: 0, reclaimedBytes: 0 };
  }
  lastTempCleanupTime = now;

  const tempDir = path.join(STORAGE_ROOT, 'temp_uploads');
  let cleanedCount = 0;
  let reclaimedBytes = 0;

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const entries = await fs.readdir(tempDir);

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const entryPath = path.join(tempDir, entry);
      try {
        const stats = await fs.stat(entryPath);
        const ageMs = now - stats.mtimeMs;

        if (forceAll || ageMs > maxAgeMs) {
          reclaimedBytes += stats.size;
          await fs.rm(entryPath, { recursive: true, force: true });
          cleanedCount++;
        }
      } catch {
        // Ignore file that might have been removed concurrently
      }
    }
  } catch {
    // Fail silently without disrupting requests
  }

  return { cleanedCount, reclaimedBytes };
}

