import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers, checkWorkspaceAccess } from '@/lib/services/workspace';
import { listClients, updateClient } from '@/lib/services/crm';
import { safeReadFile, safeWriteFile, STORAGE_ROOT } from '@/lib/storage/storage';
import path from 'path';

const WORKSPACE_DIR = path.join(STORAGE_ROOT, 'workspaces');
const DEFAULT_CUSTOM_TAGS = ['Important Client', 'High Ticket', 'Low Ticket'];

async function isUserMember(workspaceId: string, userId: string, role?: string): Promise<boolean> {
  return checkWorkspaceAccess(workspaceId, { id: userId, role });
}

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

    // 1. Read stored tags from workspace json
    const tagsFilePath = path.join(WORKSPACE_DIR, `${workspaceId}_tags.json`);
    const tagsContent = await safeReadFile(tagsFilePath);
    let savedTags: string[] = [];
    if (tagsContent) {
      try {
        const parsed = JSON.parse(tagsContent);
        if (Array.isArray(parsed)) savedTags = parsed;
      } catch {}
    }

    // 2. Scan all CRM clients in this workspace for tags
    const clients = await listClients(workspaceId);
    const clientTags = clients.flatMap(c => c.tags || []).filter(Boolean);

    // 3. Merge: DEFAULT_CUSTOM_TAGS + savedTags + clientTags
    const tagSet = new Set<string>([...DEFAULT_CUSTOM_TAGS, ...savedTags, ...clientTags]);
    const mergedTags = Array.from(tagSet).filter(t => typeof t === 'string' && t.trim().length > 0);

    return NextResponse.json({ tags: mergedTags });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch tags' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, tags, action, oldTag, newTag } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tagsFilePath = path.join(WORKSPACE_DIR, `${workspaceId}_tags.json`);
    let finalTags: string[] = Array.isArray(tags) ? tags : [];

    if (action === 'rename' && oldTag && newTag) {
      const trimmedNew = newTag.trim();
      finalTags = finalTags.map(t => t === oldTag ? trimmedNew : t);
      // Update clients having oldTag
      const clients = await listClients(workspaceId);
      for (const client of clients) {
        if (client.tags?.includes(oldTag)) {
          const nextTags = client.tags.map(t => t === oldTag ? trimmedNew : t);
          await updateClient(client.id, { tags: nextTags });
        }
      }
    } else if (action === 'delete' && oldTag) {
      finalTags = finalTags.filter(t => t !== oldTag);
      // Remove oldTag from clients
      const clients = await listClients(workspaceId);
      for (const client of clients) {
        if (client.tags?.includes(oldTag)) {
          const nextTags = client.tags.filter(t => t !== oldTag);
          await updateClient(client.id, { tags: nextTags });
        }
      }
    }

    // Always ensure valid strings and uniqueness
    const cleanTags = Array.from(new Set(finalTags.map(t => String(t).trim()).filter(Boolean)));
    await safeWriteFile(tagsFilePath, JSON.stringify(cleanTags, null, 2));

    return NextResponse.json({ success: true, tags: cleanTags });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save tags' }, { status: 500 });
  }
}
