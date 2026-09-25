import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { STORAGE_ROOT, cleanStaleTempUploads } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers, listWorkspacesForUser } from '@/lib/services/workspace';

async function checkExplorerAccess(user: any, request: NextRequest, isWrite: boolean = false): Promise<boolean> {
  if (user.role === 'admin') return true;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  if (clientId && !isWrite) return true;

  try {
    const workspaces = await listWorkspacesForUser(user.id);
    for (const ws of workspaces) {
      const members = await listWorkspaceMembers(ws.id);
      const m = members.find(mem => mem.userId === user.id);
      if (m) {
        if (m.role === 'owner' || m.role === 'manager') return true;
        const tabAccess = m.tabPermissions?.['storage'];
        if (tabAccess && tabAccess !== 'none') {
          if (isWrite && tabAccess === 'view') return false;
          return true;
        }
      }
    }
  } catch {}
  return false;
}

// Helper to recursively get directory size in bytes and file count
async function getDirStats(dirPath: string): Promise<{ sizeBytes: number; fileCount: number }> {
  let sizeBytes = 0;
  let fileCount = 0;
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        const subStats = await getDirStats(filePath);
        sizeBytes += subStats.sizeBytes;
        fileCount += subStats.fileCount;
      } else {
        sizeBytes += stats.size;
        fileCount += 1;
      }
    }
  } catch {
    // Fail silently if directory doesn't exist
  }
  return { sizeBytes, fileCount };
}

// Fetch all Clients
async function getClients(): Promise<any[]> {
  const dir = path.join(STORAGE_ROOT, 'clients');
  const clients: any[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        const content = await fs.readFile(path.join(dir, f), 'utf-8');
        const parsed = JSON.parse(content);
        clients.push({ id: parsed.id, companyName: parsed.companyName || parsed.contactPerson });
      }
    }
  } catch {}
  return clients;
}

// Fetch all Projects
async function getProjects(): Promise<any[]> {
  const dir = path.join(STORAGE_ROOT, 'projects');
  const projects: any[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        const content = await fs.readFile(path.join(dir, f), 'utf-8');
        const parsed = JSON.parse(content);
        projects.push({ id: parsed.id, name: parsed.name, clientId: parsed.clientId });
      }
    }
  } catch {}
  return projects;
}

// Fetch File Metadata
async function getFileMetadata(): Promise<any> {
  const filePath = path.join(STORAGE_ROOT, 'settings', 'file_metadata.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// Sanitization to prevent path traversal
function sanitizePath(param: string | null): boolean {
  if (!param) return false;
  // block empty, path separators, or directory traversal
  return !param.includes('..') && !param.includes('/') && !param.includes('\\') && param.trim().length > 0;
}

function sanitizeRelativePath(param: string | null): boolean {
  if (!param) return false;
  const clean = param.replace(/\\/g, '/');
  return !clean.includes('..') && !clean.startsWith('/') && !clean.includes('//') && clean.trim().length > 0;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const hasAccess = await checkExplorerAccess(user, request, false);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Storage access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const file = searchParams.get('file');

    // Scenario 1: Category and File provided -> Read file content
    if (category && file) {
      if (!sanitizePath(category) || !sanitizeRelativePath(file)) {
        return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
      }
      const filePath = path.join(STORAGE_ROOT, category, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return NextResponse.json({ content });
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
      }
    }

    // Scenario 2: Category provided -> List files in category (or nested subpath)
    if (category) {
      if (!sanitizePath(category)) {
        return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
      }
      const subpath = searchParams.get('subpath');
      if (subpath && !sanitizeRelativePath(subpath)) {
        return NextResponse.json({ error: 'Invalid subpath' }, { status: 400 });
      }

      if (category === 'temp_uploads') {
        try {
          await cleanStaleTempUploads({ throttle: true });
        } catch {}
      }

      const dirPath = subpath 
        ? path.join(STORAGE_ROOT, category, subpath)
        : path.join(STORAGE_ROOT, category);

      try {
        const files = await fs.readdir(dirPath);
        const filesList = [];
        for (const fn of files) {
          if (fn.startsWith('.')) continue;
          const filePath = path.join(dirPath, fn);
          const stats = await fs.stat(filePath);
          filesList.push({
            name: fn,
            sizeBytes: stats.isDirectory() ? 0 : stats.size,
            updatedAt: stats.mtime.toISOString(),
            isFile: stats.isFile()
          });
        }
        // Sort folders first, then files by mtime desc
        filesList.sort((a, b) => {
          if (a.isFile !== b.isFile) {
            return a.isFile ? 1 : -1; // folders first
          }
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return NextResponse.json({ files: filesList });
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return NextResponse.json({ error: 'Category or subfolder not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
      }
    }

    // Scenario 3: No parameters -> List all categories, clients, projects, and file metadata
    const categoriesList = [];
    try {
      const dirs = await fs.readdir(STORAGE_ROOT);
      for (const dir of dirs) {
        if (dir.startsWith('.')) continue;
        const dirPath = path.join(STORAGE_ROOT, dir);
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          const folderStats = await getDirStats(dirPath);
          categoriesList.push({
            name: dir,
            path: `storage/${dir}`,
            sizeBytes: folderStats.sizeBytes,
            fileCount: folderStats.fileCount
          });
        }
      }
      categoriesList.sort((a, b) => b.sizeBytes - a.sizeBytes); // sort by size desc
      
      const clientsList = await getClients();
      const projectsList = await getProjects();
      const metadataMap = await getFileMetadata();

      return NextResponse.json({ 
        categories: categoriesList,
        clients: clientsList,
        projects: projectsList,
        metadata: metadataMap
      });
    } catch {
      return NextResponse.json({ error: 'Failed to list categories' }, { status: 500 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const hasAccess = await checkExplorerAccess(user, request, true);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Storage write access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const file = searchParams.get('file');
    const action = searchParams.get('action');

    if (action === 'clean_temp') {
      const forceAll = searchParams.get('forceAll') === 'true';
      const result = await cleanStaleTempUploads({ forceAll });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'create_folder') {
      const body = await request.json();
      const folderName = body.name;
      const subpath = body.subpath || '';

      if (!category || !sanitizePath(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      if (subpath && !sanitizeRelativePath(subpath)) {
        return NextResponse.json({ error: 'Invalid subpath' }, { status: 400 });
      }
      if (!folderName || !sanitizeRelativePath(folderName)) {
        return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });
      }

      const dirPath = subpath
        ? path.join(STORAGE_ROOT, category, subpath, folderName)
        : path.join(STORAGE_ROOT, category, folderName);

      try {
        await fs.mkdir(dirPath, { recursive: true });
        return NextResponse.json({ success: true });
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to create folder' }, { status: 500 });
      }
    }

    // Special metadata write action
    if (action === 'metadata') {
      const body = await request.json();
      const metadata = body.metadata;
      if (!metadata) {
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }
      const metadataPath = path.join(STORAGE_ROOT, 'settings', 'file_metadata.json');
      const tempPath = `${metadataPath}.tmp`;
      
      await fs.mkdir(path.dirname(metadataPath), { recursive: true });
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf-8');
      await fs.rename(tempPath, metadataPath);
      
      return NextResponse.json({ success: true });
    }

    if (!category || !file || !sanitizePath(category) || !sanitizePath(file)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const body = await request.json();
    const content = body.content;

    if (content === undefined) {
      return NextResponse.json({ error: 'Missing content payload' }, { status: 400 });
    }

    const dirPath = path.join(STORAGE_ROOT, category);
    const filePath = path.join(dirPath, file);

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Atomic write
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, filePath);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to write file' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const hasAccess = await checkExplorerAccess(user, request, true);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Storage write access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const file = searchParams.get('file');

    if (!category || !file || !sanitizePath(category) || !sanitizePath(file)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const filePath = path.join(STORAGE_ROOT, category, file);
    try {
      await fs.unlink(filePath);
      
      // Also clean up metadata entries if applicable
      const metadataPath = path.join(STORAGE_ROOT, 'settings', 'file_metadata.json');
      try {
        const content = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(content);
        const fileKey = `${category}/${file}`;
        if (metadata[fileKey]) {
          delete metadata[fileKey];
          await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
        }
      } catch {}

      return NextResponse.json({ success: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function propagateRename(category: string, oldName: string, newName: string) {
  if (category !== 'uploads' && category !== 'avatars' && category !== 'attachments') {
    return;
  }

  const targetDirs = [
    'users',
    'conversations',
    'messages',
    'projects',
    'tasks',
    'wiki'
  ];

  for (const dirName of targetDirs) {
    const dirPath = path.join(STORAGE_ROOT, dirName);
    try {
      const files = await fs.readdir(dirPath);
      for (const fn of files) {
        if (!fn.endsWith('.json') || fn.startsWith('.')) continue;
        const filePath = path.join(dirPath, fn);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          if (content.includes(oldName)) {
            const updated = content.replaceAll(oldName, newName);
            const tempPath = `${filePath}.tmp`;
            await fs.writeFile(tempPath, updated, 'utf-8');
            await fs.rename(tempPath, filePath);
            console.log(`Propagated file rename (${oldName} -> ${newName}) inside ${dirName}/${fn}`);
          }
        } catch (err) {
          console.error(`Failed to propagate rename in file ${filePath}:`, err);
        }
      }
    } catch {}
  }

  const metadataPath = path.join(STORAGE_ROOT, 'settings', 'file_metadata.json');
  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(content);
    const oldKey = `${category}/${oldName}`;
    const newKey = `${category}/${newName}`;
    if (metadata[oldKey]) {
      metadata[newKey] = metadata[oldKey];
      delete metadata[oldKey];
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
      console.log(`Updated metadata linkages for ${oldKey} -> ${newKey}`);
    }
  } catch {}
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const hasAccess = await checkExplorerAccess(user, request, true);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Storage write access required' }, { status: 403 });
    }

    const body = await request.json();
    const { category, file, newName } = body;

    if (!category || !file || !newName) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    if (!sanitizePath(category) || !sanitizeRelativePath(file) || !sanitizeRelativePath(newName)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    if (file === newName) {
      return NextResponse.json({ success: true });
    }

    const oldPath = path.join(STORAGE_ROOT, category, file);
    const newPath = path.join(STORAGE_ROOT, category, newName);

    const exists = await fs.stat(oldPath).then(() => true).catch(() => false);
    if (!exists) {
      return NextResponse.json({ error: 'File or folder not found' }, { status: 404 });
    }

    const targetExists = await fs.stat(newPath).then(() => true).catch(() => false);
    if (targetExists) {
      return NextResponse.json({ error: 'A file or folder with that name already exists' }, { status: 400 });
    }

    await fs.rename(oldPath, newPath);

    const stats = await fs.stat(newPath).catch(() => null);
    if (stats && stats.isFile()) {
      await propagateRename(category, file, newName);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to rename' }, { status: 500 });
  }
}
