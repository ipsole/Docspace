import fs from 'fs/promises';
import path from 'path';
import { Document } from '../storage/models';
import { safeReadFile, safeWriteFile, safeDeleteFile, STORAGE_ROOT } from '../storage/storage';
import { isFirestoreEnabled, firestoreList, firestoreGet } from '../storage/firestoreAdapter';
import { v4 as uuidv4 } from 'uuid';

const DOCS_DIR = path.join(STORAGE_ROOT, 'documents');

// Ensure directories exist safely without throwing on read-only environments
async function ensureDirs() {
  if (process.env.VERCEL || isFirestoreEnabled()) return;
  try {
    await fs.mkdir(DOCS_DIR, { recursive: true });
  } catch (err: any) {
    if (err?.code !== 'EROFS') throw err;
  }
}

// --- WIKI OPERATIONS ---

export async function listWikiPages(workspaceId: string): Promise<Document[]> {
  if (isFirestoreEnabled()) {
    const docs = await firestoreList<Document>('documents');
    return docs
      .filter(d => d && d.workspaceId === workspaceId && d.isWiki)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  await ensureDirs();
  const files = await fs.readdir(DOCS_DIR).catch(() => []);
  const docs: Document[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await safeReadFile(path.join(DOCS_DIR, file));
      if (content) {
        try {
          const doc = JSON.parse(content) as Document;
          if (doc.workspaceId === workspaceId && doc.isWiki) {
            docs.push(doc);
          }
        } catch {}
      }
    }
  }

  return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getWikiPage(id: string): Promise<Document | null> {
  if (isFirestoreEnabled()) {
    const doc = await firestoreGet<Document>('documents', id);
    if (doc) return doc;
  }
  await ensureDirs();
  const content = await safeReadFile(path.join(DOCS_DIR, `${id}.json`));
  if (!content) return null;
  return JSON.parse(content) as Document;
}

export async function createWikiPage(
  workspaceId: string,
  authorId: string,
  title: string,
  content: string,
  parentId: string | null = null,
  metadata: Pick<Document, 'clientId' | 'projectId'> = {}
): Promise<Document> {
  await ensureDirs();
  const id = uuidv4();
  const doc: Document = {
    id,
    workspaceId,
    title,
    content,
    parentId,
    clientId: metadata.clientId || null,
    projectId: metadata.projectId || null,
    isWiki: true,
    authorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(DOCS_DIR, `${id}.json`), JSON.stringify(doc, null, 2));
  return doc;
}

export async function updateWikiPage(id: string, updates: Partial<Document>): Promise<Document> {
  const doc = await getWikiPage(id);
  if (!doc) throw new Error('Document not found');

  const updatedDoc = {
    ...doc,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(DOCS_DIR, `${id}.json`), JSON.stringify(updatedDoc, null, 2));
  return updatedDoc;
}

export async function deleteWikiPage(id: string): Promise<void> {
  await ensureDirs();
  
  // Recursively delete children or reset their parentId to null
  const files = await fs.readdir(DOCS_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(DOCS_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const doc = JSON.parse(content) as Document;
          if (doc.parentId === id) {
            // Delete child pages recursively
            await deleteWikiPage(doc.id);
          }
        } catch {}
      }
    }
  }

  await safeDeleteFile(path.join(DOCS_DIR, `${id}.json`));
}
