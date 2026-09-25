import fs from 'fs/promises';
import path from 'path';
import { Workspace, WorkspaceMember, User } from '../storage/models';
import { safeReadFile, safeWriteFile, safeDeleteFile, STORAGE_ROOT, readUser } from '../storage/storage';
import { isFirestoreEnabled, firestoreListDocs, firestoreSet } from '../storage/firestoreAdapter';
import { v4 as uuidv4 } from 'uuid';

const WORKSPACE_DIR = path.join(STORAGE_ROOT, 'workspaces');

function isJsonDataFile(file: string): boolean {
  return file.endsWith('.json') && !file.startsWith('._');
}

// Ensure workspaces folder exists safely without throwing on read-only environments
async function ensureWorkspaceDir() {
  if (process.env.VERCEL || isFirestoreEnabled()) return;
  try {
    await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  } catch (err: any) {
    if (err?.code !== 'EROFS') throw err;
  }
}

export async function createWorkspace(name: string, ownerId: string): Promise<Workspace> {
  await ensureWorkspaceDir();
  
  const id = uuidv4();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const now = new Date().toISOString();

  const workspace: Workspace = {
    id,
    name,
    slug: `${slug}-${id.slice(0, 5)}`,
    logoUrl: null,
    ownerId,
    createdAt: now,
    updatedAt: now
  };

  const member: WorkspaceMember = {
    workspaceId: id,
    userId: ownerId,
    role: 'owner',
    joinedAt: now
  };

  // Save workspace metadata
  await safeWriteFile(path.join(WORKSPACE_DIR, `${id}.json`), JSON.stringify(workspace, null, 2));

  // Save workspace membership list
  await safeWriteFile(path.join(WORKSPACE_DIR, `${id}_members.json`), JSON.stringify([member], null, 2));

  return workspace;
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  if (isFirestoreEnabled()) {
    const { firestoreGet } = await import('../storage/firestoreAdapter');
    const ws = await firestoreGet<Workspace>('workspaces', id);
    if (ws) return ws;
  }
  const content = await safeReadFile(path.join(WORKSPACE_DIR, `${id}.json`));
  if (!content) return null;
  try {
    return JSON.parse(content) as Workspace;
  } catch {
    return null;
  }
}

export async function updateWorkspace(id: string, name: string, logoUrl?: string | null): Promise<Workspace> {
  const ws = await getWorkspace(id);
  if (!ws) throw new Error('Workspace not found');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const updatedWs: Workspace = {
    ...ws,
    name,
    slug: `${slug}-${id.slice(0, 5)}`,
    logoUrl: logoUrl !== undefined ? logoUrl : ws.logoUrl,
    updatedAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(WORKSPACE_DIR, `${id}.json`), JSON.stringify(updatedWs, null, 2));
  return updatedWs;
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  if (isFirestoreEnabled()) {
    const docs = await firestoreListDocs('workspaces');
    const workspaces: Workspace[] = [];
    const wsMap = new Map<string, Workspace>();

    for (const doc of docs) {
      if (!doc.id.includes('_')) {
        wsMap.set(doc.id, doc.data as Workspace);
      }
    }

    for (const doc of docs) {
      if (doc.id.endsWith('_members')) {
        const members: WorkspaceMember[] = Array.isArray(doc.data)
          ? (doc.data as WorkspaceMember[])
          : Array.isArray((doc.data as any)?.items)
          ? ((doc.data as any).items as WorkspaceMember[])
          : [];
        if (members.some(m => m.userId === userId)) {
          const wsId = doc.id.replace('_members', '');
          const ws = wsMap.get(wsId);
          if (ws && !workspaces.some(w => w.id === ws.id)) {
            workspaces.push(ws);
          }
        }
      }
    }

    // Ensure workspace owners always have access to their workspaces
    for (const [id, ws] of wsMap) {
      if (ws.ownerId === userId && !workspaces.some(w => w.id === id)) {
        workspaces.push(ws);
      }
    }

    // Also check local disk storage files to guarantee membership access even if cloud sync was pending
    try {
      await ensureWorkspaceDir();
      const files = await fs.readdir(WORKSPACE_DIR).catch(() => []);
      for (const file of files) {
        if (isJsonDataFile(file) && file.endsWith('_members.json')) {
          const raw = await fs.readFile(path.join(WORKSPACE_DIR, file), 'utf-8').catch(() => null);
          if (raw) {
            try {
              const localMembers = JSON.parse(raw) as WorkspaceMember[];
              if (localMembers.some(m => m.userId === userId)) {
                const wsId = file.replace('_members.json', '');
                let ws = wsMap.get(wsId);
                if (!ws) {
                  const wsRaw = await fs.readFile(path.join(WORKSPACE_DIR, `${wsId}.json`), 'utf-8').catch(() => null);
                  if (wsRaw) ws = JSON.parse(wsRaw);
                }
                if (ws && !workspaces.some(w => w.id === ws.id)) {
                  workspaces.push(ws);
                  // Resync to Firestore now that array wrapper is active
                  firestoreSet('workspaces', file.replace(/\.json$/, ''), localMembers).catch(() => {});
                }
              }
            } catch {}
          }
        }
      }
    } catch {}

    return workspaces.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  await ensureWorkspaceDir();
  const files = await fs.readdir(WORKSPACE_DIR).catch(() => []);
  const workspaces: Workspace[] = [];

  for (const file of files) {
    if (isJsonDataFile(file) && file.endsWith('_members.json')) {
      const content = await safeReadFile(path.join(WORKSPACE_DIR, file));
      if (content) {
        try {
          const members = JSON.parse(content) as WorkspaceMember[];
          const isMember = members.some(m => m.userId === userId);
          if (isMember) {
            const workspaceId = file.replace('_members.json', '');
            const ws = await getWorkspace(workspaceId);
            if (ws) {
              workspaces.push(ws);
            }
          }
        } catch {
          // ignore parsing issues
        }
      }
    }
  }

  return workspaces.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function addMemberToWorkspace(
  workspaceId: string,
  userId: string,
  role: WorkspaceMember['role'],
  allowedSections?: string[],
  tabPermissions?: Record<string, 'full' | 'view' | 'none'>
): Promise<WorkspaceMember> {
  await ensureWorkspaceDir();
  const membersPath = path.join(WORKSPACE_DIR, `${workspaceId}_members.json`);
  const content = await safeReadFile(membersPath);
  let members: WorkspaceMember[] = [];

  if (content) {
    try {
      members = JSON.parse(content) as WorkspaceMember[];
    } catch {}
  }

  // Check if already a member
  const existing = members.find(m => m.userId === userId);
  if (existing) {
    existing.role = role;
    if (allowedSections) {
      existing.allowedSections = allowedSections;
    }
    if (tabPermissions) {
      existing.tabPermissions = tabPermissions;
    }
  } else {
    members.push({
      workspaceId,
      userId,
      role,
      joinedAt: new Date().toISOString(),
      allowedSections: allowedSections || ['chats', 'projects', 'calendar', 'leads', 'clients', 'invoices', 'white-label', 'billing', 'storage', 'settings'],
      tabPermissions: tabPermissions || {
        chats: 'full',
        projects: 'full',
        calendar: 'full',
        leads: 'full',
        clients: 'full',
        invoices: 'full',
        'white-label': 'full',
        billing: role === 'owner' || role === 'manager' || role === 'admin' ? 'full' : 'none',
        storage: role === 'owner' || role === 'manager' || role === 'admin' ? 'full' : 'none',
        settings: role === 'owner' || role === 'manager' || role === 'admin' ? 'full' : 'none',
      }
    });
  }

  await safeWriteFile(membersPath, JSON.stringify(members, null, 2));
  return members.find(m => m.userId === userId)!;
}

export async function updateMemberInWorkspace(
  workspaceId: string,
  userId: string,
  updates: {
    role?: WorkspaceMember['role'];
    allowedSections?: string[];
    tabPermissions?: Record<string, 'full' | 'view' | 'none'>;
  }
): Promise<WorkspaceMember> {
  await ensureWorkspaceDir();
  const membersPath = path.join(WORKSPACE_DIR, `${workspaceId}_members.json`);
  const content = await safeReadFile(membersPath);
  if (!content) throw new Error('Workspace members not found');

  let members = JSON.parse(content) as WorkspaceMember[];
  const member = members.find(m => m.userId === userId);
  if (!member) throw new Error('Member not found in workspace');

  if (updates.role) member.role = updates.role;
  if (updates.allowedSections !== undefined) member.allowedSections = updates.allowedSections;
  if (updates.tabPermissions !== undefined) member.tabPermissions = updates.tabPermissions;

  await safeWriteFile(membersPath, JSON.stringify(members, null, 2));
  return member;
}

export async function removeMemberFromWorkspace(workspaceId: string, userId: string): Promise<void> {
  await ensureWorkspaceDir();
  const membersPath = path.join(WORKSPACE_DIR, `${workspaceId}_members.json`);
  const content = await safeReadFile(membersPath);
  if (!content) return;

  try {
    let members = JSON.parse(content) as WorkspaceMember[];
    members = members.filter(m => m.userId !== userId);
    await safeWriteFile(membersPath, JSON.stringify(members, null, 2));
  } catch {}
}

export interface WorkspaceMemberWithProfile extends WorkspaceMember {
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    avatar: string | null;
    status: User['status'];
  };
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberWithProfile[]> {
  await ensureWorkspaceDir();
  const membersPath = path.join(WORKSPACE_DIR, `${workspaceId}_members.json`);
  const content = await safeReadFile(membersPath);
  if (!content) return [];

  try {
    const raw = JSON.parse(content);
    const members: WorkspaceMember[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
      ? raw.items
      : [];
    const result: WorkspaceMemberWithProfile[] = [];

    for (const m of members) {
      const u = await readUser(m.userId);
      if (u) {
        result.push({
          ...m,
          user: {
            id: u.id,
            username: u.username,
            displayName: u.displayName || u.username,
            email: u.email,
            avatar: u.avatar,
            status: u.status
          }
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

export async function listAllWorkspaces(): Promise<Workspace[]> {
  if (isFirestoreEnabled()) {
    const docs = await firestoreListDocs<Workspace>('workspaces');
    return docs
      .filter(d => !d.id.endsWith('_members') && !d.id.endsWith('_requests'))
      .map(d => d.data);
  }

  await ensureWorkspaceDir();
  const files = await fs.readdir(WORKSPACE_DIR).catch(() => []);
  const workspaces: Workspace[] = [];

  for (const file of files) {
    if (isJsonDataFile(file) && !file.endsWith('_members.json') && !file.endsWith('_requests.json')) {
      const content = await safeReadFile(path.join(WORKSPACE_DIR, file));
      if (content) {
        try {
          const ws = JSON.parse(content) as Workspace;
          workspaces.push(ws);
        } catch {}
      }
    }
  }

  return workspaces;
}

export interface JoinRequest {
  workspaceId: string;
  userId: string;
  username: string;
  displayName: string;
  requestedAt: string;
}

export async function createJoinRequest(workspaceId: string, userId: string): Promise<JoinRequest> {
  await ensureWorkspaceDir();
  const requestsPath = path.join(WORKSPACE_DIR, `${workspaceId}_requests.json`);
  const content = await safeReadFile(requestsPath);
  let requests: JoinRequest[] = [];

  if (content) {
    try {
      requests = JSON.parse(content) as JoinRequest[];
    } catch {}
  }

  // Check if request already exists
  if (requests.some(r => r.userId === userId)) {
    throw new Error('Join request already submitted');
  }

  const u = await readUser(userId);
  if (!u) throw new Error('User not found');

  const newRequest: JoinRequest = {
    workspaceId,
    userId,
    username: u.username,
    displayName: u.displayName || u.username,
    requestedAt: new Date().toISOString()
  };

  requests.push(newRequest);
  await safeWriteFile(requestsPath, JSON.stringify(requests, null, 2));
  return newRequest;
}

export async function listJoinRequests(workspaceId: string): Promise<JoinRequest[]> {
  await ensureWorkspaceDir();
  const requestsPath = path.join(WORKSPACE_DIR, `${workspaceId}_requests.json`);
  const content = await safeReadFile(requestsPath);
  if (!content) return [];

  try {
    return JSON.parse(content) as JoinRequest[];
  } catch {
    return [];
  }
}

export async function resolveJoinRequest(
  workspaceId: string,
  userId: string,
  action: 'approve' | 'reject'
): Promise<void> {
  await ensureWorkspaceDir();
  const requestsPath = path.join(WORKSPACE_DIR, `${workspaceId}_requests.json`);
  const content = await safeReadFile(requestsPath);
  if (!content) return;

  try {
    let requests = JSON.parse(content) as JoinRequest[];
    const req = requests.find(r => r.userId === userId);
    if (!req) return;

    requests = requests.filter(r => r.userId !== userId);
    await safeWriteFile(requestsPath, JSON.stringify(requests, null, 2));

    if (action === 'approve') {
      await addMemberToWorkspace(workspaceId, userId, 'member');
    }
  } catch {}
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await ensureWorkspaceDir();
  await safeDeleteFile(path.join(WORKSPACE_DIR, `${workspaceId}.json`));
  await safeDeleteFile(path.join(WORKSPACE_DIR, `${workspaceId}_members.json`));
  await safeDeleteFile(path.join(WORKSPACE_DIR, `${workspaceId}_requests.json`));
}

export async function checkWorkspaceAccess(workspaceId: string, user: { id: string; role?: string }): Promise<boolean> {
  if (user.role === 'admin') return true;
  const ws = await getWorkspace(workspaceId);
  if (ws && ws.ownerId === user.id) return true;
  const members = await listWorkspaceMembers(workspaceId);
  return members.some(m => m.userId === user.id);
}
