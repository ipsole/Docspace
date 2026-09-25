import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { STORAGE_ROOT, cleanStaleTempUploads, safeReadFile, safeWriteFile } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers, listWorkspacesForUser } from '@/lib/services/workspace';
import { isR2Enabled, listFromR2, getFromR2, deleteFromR2 } from '@/lib/storage/r2Adapter';
import { isFirestoreEnabled, firestoreGet, firestoreSet, firestoreDelete, firestoreListDocs } from '@/lib/storage/firestoreAdapter';
import { getFirestoreDb } from '@/lib/firebase/admin';
import { listClients } from '@/lib/services/crm';
import { listProjects } from '@/lib/services/project';

const STANDARD_DIRS = [
  'uploads',
  'avatars',
  'attachments',
  'contracts',
  'temp_uploads',
  'users',
  'workspaces',
  'clients',
  'projects',
  'tasks',
  'invoices',
  'payments',
  'crm',
  'conversations',
  'messages',
  'wiki',
  'calendar',
  'events',
  'notifications',
  'logs',
  'analytics',
  'settings',
  'templates',
  'backups'
];

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

// Helper to recursively get directory size in bytes and file count from local disk
async function getDirStats(dirPath: string): Promise<{ sizeBytes: number; fileCount: number }> {
  let sizeBytes = 0;
  let fileCount = 0;
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats) continue;
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

// Fetch all Clients (workspace-scoped or cloud-wide)
async function getClients(workspaceId?: string | null): Promise<any[]> {
  try {
    if (workspaceId) {
      const cList = await listClients(workspaceId);
      if (cList && cList.length > 0) {
        return cList.map(c => ({ id: c.id, companyName: c.companyName || c.contactPerson }));
      }
    }
  } catch {}

  if (isFirestoreEnabled()) {
    try {
      const docs = await firestoreListDocs<any>('clients');
      if (docs && docs.length > 0) {
        return docs.map(d => ({ id: d.id, companyName: d.data?.companyName || d.data?.contactPerson || d.id }));
      }
    } catch {}
  }

  const dir = path.join(STORAGE_ROOT, 'clients');
  const clients: any[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.endsWith('.json') && !f.startsWith('.')) {
        const content = await fs.readFile(path.join(dir, f), 'utf-8');
        const parsed = JSON.parse(content);
        clients.push({ id: parsed.id, companyName: parsed.companyName || parsed.contactPerson });
      }
    }
  } catch {}
  return clients;
}

// Fetch all Projects (workspace-scoped or cloud-wide)
async function getProjects(workspaceId?: string | null): Promise<any[]> {
  try {
    if (workspaceId) {
      const pList = await listProjects(workspaceId);
      if (pList && pList.length > 0) {
        return pList.map(p => ({ id: p.id, name: p.name, clientId: p.clientId }));
      }
    }
  } catch {}

  if (isFirestoreEnabled()) {
    try {
      const docs = await firestoreListDocs<any>('projects');
      if (docs && docs.length > 0) {
        return docs.map(d => ({ id: d.id, name: d.data?.name || d.id, clientId: d.data?.clientId }));
      }
    } catch {}
  }

  const dir = path.join(STORAGE_ROOT, 'projects');
  const projects: any[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.endsWith('.json') && !f.startsWith('.')) {
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
    const content = await safeReadFile(filePath);
    return content ? JSON.parse(content) : {};
  } catch {
    return {};
  }
}

// Sanitization to prevent path traversal
function sanitizePath(param: string | null): boolean {
  if (!param) return false;
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
    const workspaceId = searchParams.get('workspaceId');

    // Scenario 1: Category and File provided -> Read file content
    if (category && file) {
      if (!sanitizePath(category) || !sanitizeRelativePath(file)) {
        return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
      }

      // 1. Try reading from Firestore if .json
      if (isFirestoreEnabled() && file.endsWith('.json')) {
        const docId = file.replace(/\.json$/, '');
        try {
          const doc = await firestoreGet(category, docId);
          if (doc !== null) {
            return NextResponse.json({ content: JSON.stringify(doc, null, 2) });
          }
        } catch {}
      }

      // 2. Try reading from Cloudflare R2 if enabled
      if (isR2Enabled()) {
        try {
          const r2Key = `${category}/${file}`;
          const r2Obj = await getFromR2(r2Key);
          if (r2Obj && r2Obj.stream) {
            const buf = await r2Obj.stream.transformToByteArray();
            const text = Buffer.from(buf).toString('utf-8');
            return NextResponse.json({ content: text });
          }
        } catch {}
      }

      // 3. Fallback to reading file from local storage
      const filePath = path.join(STORAGE_ROOT, category, file);
      try {
        const content = await safeReadFile(filePath);
        if (content !== null) {
          return NextResponse.json({ content });
        }
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
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

      const fileMap = new Map<string, { name: string; sizeBytes: number; updatedAt: string; isFile: boolean }>();

      // 1. If Cloudflare R2 is enabled, check R2 objects
      if (isR2Enabled()) {
        try {
          const prefix = subpath ? `${category}/${subpath}/` : `${category}/`;
          const r2Files = await listFromR2(prefix);
          for (const rf of r2Files) {
            const relKey = rf.key.startsWith(prefix) ? rf.key.substring(prefix.length) : rf.key;
            if (!relKey) continue;
            const firstSegment = relKey.split('/')[0];
            const isDir = relKey.includes('/');
            if (!fileMap.has(firstSegment)) {
              fileMap.set(firstSegment, {
                name: firstSegment,
                sizeBytes: isDir ? 0 : rf.size,
                updatedAt: rf.lastModified || new Date().toISOString(),
                isFile: !isDir,
              });
            }
          }
        } catch (err) {
          console.warn('R2 category listing error:', err);
        }
      }

      // 2. If Google Firestore is enabled, check Firestore documents
      if (isFirestoreEnabled() && !subpath) {
        try {
          const docs = await firestoreListDocs<any>(category);
          for (const d of docs) {
            const jsonStr = JSON.stringify(d.data || {});
            const fileName = `${d.id}.json`;
            const updatedAt = d.data?.updatedAt || d.data?.createdAt || new Date().toISOString();
            fileMap.set(fileName, {
              name: fileName,
              sizeBytes: Buffer.byteLength(jsonStr, 'utf8'),
              updatedAt,
              isFile: true,
            });
          }
        } catch (err) {
          console.warn('Firestore category docs error:', err);
        }
      }

      // 3. Local disk files (fallback / merge)
      const dirPath = subpath 
        ? path.join(STORAGE_ROOT, category, subpath)
        : path.join(STORAGE_ROOT, category);

      try {
        const localFiles = await fs.readdir(dirPath);
        for (const fn of localFiles) {
          if (fn.startsWith('.')) continue;
          const filePath = path.join(dirPath, fn);
          const stats = await fs.stat(filePath).catch(() => null);
          if (stats && !fileMap.has(fn)) {
            fileMap.set(fn, {
              name: fn,
              sizeBytes: stats.isDirectory() ? 0 : stats.size,
              updatedAt: stats.mtime.toISOString(),
              isFile: stats.isFile(),
            });
          }
        }
      } catch {}

      const filesList = Array.from(fileMap.values());
      // Sort folders first, then files by updatedAt desc
      filesList.sort((a, b) => {
        if (a.isFile !== b.isFile) {
          return a.isFile ? 1 : -1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

      return NextResponse.json({ files: filesList });
    }

    // Scenario 3: No parameters -> List all categories, clients, projects, and file metadata
    const categoryMap = new Map<string, { name: string; path: string; sizeBytes: number; fileCount: number }>();

    // 1. Initialize with standard directories so they always display in UI
    for (const d of STANDARD_DIRS) {
      categoryMap.set(d, {
        name: d,
        path: `storage/${d}`,
        sizeBytes: 0,
        fileCount: 0,
      });
    }

    // 2. Query Cloudflare R2 if enabled
    if (isR2Enabled()) {
      try {
        const r2Entries = await listFromR2('');
        for (const entry of r2Entries) {
          const slashIdx = entry.key.indexOf('/');
          const cat = slashIdx > -1 ? entry.key.substring(0, slashIdx) : 'uploads';
          const existing = categoryMap.get(cat) || {
            name: cat,
            path: `storage/${cat}`,
            sizeBytes: 0,
            fileCount: 0,
          };
          existing.sizeBytes += entry.size;
          existing.fileCount += 1;
          categoryMap.set(cat, existing);
        }
      } catch (err) {
        console.warn('R2 listing error in explorer:', err);
      }
    }

    // 3. Query Google Firestore if enabled
    if (isFirestoreEnabled()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const firestoreCollections = [
            'users', 'workspaces', 'clients', 'projects', 'tasks',
            'invoices', 'payments', 'crm', 'conversations', 'messages',
            'wiki', 'calendar', 'events', 'notifications', 'logs',
            'analytics', 'settings', 'templates', 'backups'
          ];
          await Promise.all(
            firestoreCollections.map(async (colName) => {
              try {
                const snap = await db.collection(colName).get();
                if (snap.size > 0) {
                  let totalBytes = 0;
                  snap.docs.forEach(doc => {
                    const str = JSON.stringify(doc.data() || {});
                    totalBytes += Buffer.byteLength(str, 'utf8');
                  });
                  const existing = categoryMap.get(colName) || {
                    name: colName,
                    path: `storage/${colName}`,
                    sizeBytes: 0,
                    fileCount: 0,
                  };
                  existing.fileCount = Math.max(existing.fileCount, snap.size);
                  existing.sizeBytes = Math.max(existing.sizeBytes, totalBytes);
                  categoryMap.set(colName, existing);
                }
              } catch {}
            })
          );
        }
      } catch (err) {
        console.warn('Firestore collections error in explorer:', err);
      }
    }

    // 4. Local disk scan (for development or local files)
    try {
      const dirs = await fs.readdir(STORAGE_ROOT);
      for (const dir of dirs) {
        if (dir.startsWith('.')) continue;
        const dirPath = path.join(STORAGE_ROOT, dir);
        const stats = await fs.stat(dirPath).catch(() => null);
        if (stats && stats.isDirectory()) {
          const folderStats = await getDirStats(dirPath);
          const existing = categoryMap.get(dir) || {
            name: dir,
            path: `storage/${dir}`,
            sizeBytes: 0,
            fileCount: 0,
          };
          existing.sizeBytes = Math.max(existing.sizeBytes, folderStats.sizeBytes);
          existing.fileCount = Math.max(existing.fileCount, folderStats.fileCount);
          categoryMap.set(dir, existing);
        }
      }
    } catch {}

    const categoriesList = Array.from(categoryMap.values()).sort((a, b) => b.sizeBytes - a.sizeBytes);
    
    const [clientsList, projectsList, metadataMap] = await Promise.all([
      getClients(workspaceId),
      getProjects(workspaceId),
      getFileMetadata()
    ]);

    return NextResponse.json({ 
      categories: categoriesList,
      clients: clientsList,
      projects: projectsList,
      metadata: metadataMap
    });

  } catch (error: any) {
    console.error('Explorer GET error:', error);
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
      await safeWriteFile(metadataPath, JSON.stringify(metadata, null, 2));
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

    // Save JSON to Firestore if enabled
    if (file.endsWith('.json') && isFirestoreEnabled()) {
      try {
        const docId = file.replace(/\.json$/, '');
        const parsed = JSON.parse(content);
        await firestoreSet(category, docId, parsed);
      } catch {}
    }

    // Save locally safely
    const filePath = path.join(STORAGE_ROOT, category, file);
    await safeWriteFile(filePath, content);

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

    // Delete from Firestore if .json
    if (file.endsWith('.json') && isFirestoreEnabled()) {
      try {
        const docId = file.replace(/\.json$/, '');
        await firestoreDelete(category, docId);
      } catch {}
    }

    // Delete from Cloudflare R2 if enabled
    if (isR2Enabled()) {
      try {
        await deleteFromR2(`${category}/${file}`);
      } catch {}
    }

    // Delete local file if present
    const filePath = path.join(STORAGE_ROOT, category, file);
    try {
      await fs.unlink(filePath);
    } catch {}

    // Clean up metadata
    const metadataPath = path.join(STORAGE_ROOT, 'settings', 'file_metadata.json');
    try {
      const content = await safeReadFile(metadataPath);
      if (content) {
        const metadata = JSON.parse(content);
        const fileKey = `${category}/${file}`;
        if (metadata[fileKey]) {
          delete metadata[fileKey];
          await safeWriteFile(metadataPath, JSON.stringify(metadata, null, 2));
        }
      }
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete file' }, { status: 500 });
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
