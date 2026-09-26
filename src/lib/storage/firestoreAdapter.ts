import fs from 'fs';
import path from 'path';
import { getFirestoreDb, isFirestoreEnabled } from '../firebase/admin';

export { isFirestoreEnabled };

// In-memory cache structures
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

export interface FirestoreDocEntry<T = any> {
  id: string;
  data: T;
}

// Default TTL for static/slow collections (saves reads, instant page loads)
const DEFAULT_TTL_MS = 60 * 1000;

function getCollectionTTL(collectionName: string): number {
  if (collectionName === 'messages') return 2000; // 2s TTL: prevents quota exhaustion on rapid client polling
  if (collectionName === 'conversations') return 3000; // 3s TTL for conversations
  return DEFAULT_TTL_MS;
}

// Individual document cache: key is "collection/docId"
const docCache = new Map<string, CacheEntry<any>>();

// Collection document-list cache: key is "collection"
const collectionCache = new Map<string, CacheEntry<FirestoreDocEntry<any>[]>>();

// In-flight deduplication promises
const inFlightGets = new Map<string, Promise<any>>();
const inFlightLists = new Map<string, Promise<any>>();

// Quota exhaustion circuit-breaker state
let isFirestoreQuotaExhausted = false;
let quotaExhaustedResetTime = 0;

export function checkFirestoreQuotaExhausted(): boolean {
  if (isFirestoreQuotaExhausted) {
    if (Date.now() > quotaExhaustedResetTime) {
      isFirestoreQuotaExhausted = false;
      return false;
    }
    return true;
  }
  return false;
}

export function markFirestoreQuotaExhausted(err?: any): void {
  const errMsg = String(err?.message || err || '');
  const errCode = err?.code;
  if (
    errCode === 8 ||
    errCode === 'RESOURCE_EXHAUSTED' ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('Quota exceeded') ||
    errMsg.includes('quota')
  ) {
    console.warn('[Firestore] Quota exhausted! Activating local/seed fallback circuit breaker for 15 minutes.');
    isFirestoreQuotaExhausted = true;
    quotaExhaustedResetTime = Date.now() + 15 * 60 * 1000;
  }
}

/**
 * Determines if a document stored in Firestore is an array wrapper that should be unwrapped.
 * IMPORTANT: Normal entities like Invoice have an `items` field (line items) and must NOT be unwrapped!
 */
function shouldUnwrapArray(collectionName: string, docId: string, data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (data._isArrayWrapper === true || data.__is_array_wrapper__ === true) return true;
  // Specific collections and member lists known to be top-level arrays
  if (collectionName === 'messages' && Array.isArray(data.items)) return true;
  if ((docId.endsWith('_members') || docId.endsWith('_requests')) && Array.isArray(data.items)) return true;
  // An array wrapper only contains { items: [...] } and nothing else
  const keys = Object.keys(data);
  if (keys.length === 1 && keys[0] === 'items' && Array.isArray(data.items)) return true;
  return false;
}

/**
 * Helper to load fallback documents from disk (storage/ and storage_seed/)
 */
async function loadFallbackDocs<T = any>(collectionName: string): Promise<FirestoreDocEntry<T>[]> {
  const entries: FirestoreDocEntry<T>[] = [];
  const seenIds = new Set<string>();
  const roots = [
    path.join(process.cwd(), 'storage', collectionName),
    path.join(process.cwd(), 'storage_seed', collectionName)
  ];

  for (const dir of roots) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = await fs.promises.readdir(dir).catch(() => []);
      for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('._')) {
          const id = file.replace(/\.json$/, '');
          if (!seenIds.has(id)) {
            seenIds.add(id);
            const content = await fs.promises.readFile(path.join(dir, file), 'utf-8').catch(() => null);
            if (content) {
              try {
                const data = JSON.parse(content);
                entries.push({ id, data });
                docCache.set(`${collectionName}/${id}`, { data, cachedAt: Date.now() });
              } catch {}
            }
          }
        }
      }
    } catch {}
  }
  return entries;
}

/**
 * Helper to load a single fallback document from disk
 */
async function loadFallbackDoc<T = any>(collectionName: string, docId: string): Promise<T | null> {
  const roots = [
    path.join(process.cwd(), 'storage', collectionName, `${docId}.json`),
    path.join(process.cwd(), 'storage_seed', collectionName, `${docId}.json`)
  ];

  for (const f of roots) {
    try {
      if (!fs.existsSync(f)) continue;
      const content = await fs.promises.readFile(f, 'utf-8').catch(() => null);
      if (content) {
        try {
          const data = JSON.parse(content);
          docCache.set(`${collectionName}/${docId}`, { data, cachedAt: Date.now() });
          return data as T;
        } catch {}
      }
    } catch {}
  }
  return null;
}

/**
 * Invalidates cache for a specific document, an entire collection, or everything.
 */
export function invalidateCache(collectionName?: string, docId?: string): void {
  if (collectionName && docId) {
    docCache.delete(`${collectionName}/${docId}`);
    collectionCache.delete(collectionName);
  } else if (collectionName) {
    collectionCache.delete(collectionName);
    for (const key of docCache.keys()) {
      if (key.startsWith(`${collectionName}/`)) {
        docCache.delete(key);
      }
    }
  } else {
    docCache.clear();
    collectionCache.clear();
  }
}

/**
 * Reads a document from Firestore with in-memory caching and request deduplication.
 * If data was a wrapped array, it unwraps it. Falls back to disk/seed if quota exhausted.
 */
export async function firestoreGet<T = any>(collectionName: string, docId: string): Promise<T | null> {
  const cacheKey = `${collectionName}/${docId}`;
  const now = Date.now();
  const ttl = getCollectionTTL(collectionName);

  const cached = docCache.get(cacheKey);
  if (ttl > 0 && cached && (now - cached.cachedAt < ttl)) {
    return cached.data as T;
  }

  // Deduplicate in-flight get requests
  if (inFlightGets.has(cacheKey)) {
    return inFlightGets.get(cacheKey) as Promise<T | null>;
  }

  // If quota is already known to be exhausted, bypass Firestore immediately
  if (checkFirestoreQuotaExhausted()) {
    if (cached) return cached.data as T;
    return await loadFallbackDoc<T>(collectionName, docId);
  }

  const fetchPromise = (async () => {
    const db = getFirestoreDb();
    if (!db) {
      return await loadFallbackDoc<T>(collectionName, docId);
    }

    try {
      const docSnap = await db.collection(collectionName).doc(docId).get();
      if (!docSnap.exists) {
        // Check fallback if not in Firestore
        const fallback = await loadFallbackDoc<T>(collectionName, docId);
        if (fallback) return fallback;
        return null;
      }

      const data = docSnap.data();
      let unwrapped: any = data;
      if (data && shouldUnwrapArray(collectionName, docId, data)) {
        unwrapped = (data as Record<string, unknown>).items;
      }

      docCache.set(cacheKey, { data: unwrapped, cachedAt: Date.now() });
      return unwrapped as T;
    } catch (err: any) {
      markFirestoreQuotaExhausted(err);
      console.error(`Firestore get error [${collectionName}/${docId}]:`, err?.message || err);
      // Fallback on error (quota exhausted, network issue)
      if (cached) return cached.data as T;
      return await loadFallbackDoc<T>(collectionName, docId);
    } finally {
      inFlightGets.delete(cacheKey);
    }
  })();

  inFlightGets.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Saves a document to Firestore with write-through cache update.
 * Gracefully tolerates quota exhaustion so users can continue operating.
 */
export async function firestoreSet(collectionName: string, docId: string, data: any): Promise<void> {
  const cacheKey = `${collectionName}/${docId}`;

  // Update in-memory document cache immediately
  docCache.set(cacheKey, { data, cachedAt: Date.now() });

  // Update collection cache in-place for instant post-update reads
  const cachedCol = collectionCache.get(collectionName);
  if (cachedCol) {
    const idx = cachedCol.data.findIndex(entry => entry.id === docId);
    if (idx >= 0) {
      cachedCol.data[idx] = { id: docId, data };
    } else {
      cachedCol.data.push({ id: docId, data });
    }
  }

  // If quota is exhausted, skip the remote Firestore write
  if (checkFirestoreQuotaExhausted()) {
    return;
  }

  const db = getFirestoreDb();
  if (!db) return;

  try {
    // Recursively clean undefined values which Firestore rejects
    const cleaned = data === undefined ? null : JSON.parse(JSON.stringify(data));
    const docData = Array.isArray(cleaned) ? { _isArrayWrapper: true, items: cleaned } : cleaned;
    await db.collection(collectionName).doc(docId).set(docData, { merge: true });
  } catch (err: any) {
    markFirestoreQuotaExhausted(err);
    console.error(`Firestore set error [${collectionName}/${docId}]:`, err?.message || err);
    // If quota was exhausted, don't crash callers — local cache and disk store are already updated
    if (checkFirestoreQuotaExhausted()) {
      return;
    }
    throw err;
  }
}

/**
 * Deletes a document from Firestore with cache invalidation.
 */
export async function firestoreDelete(collectionName: string, docId: string): Promise<void> {
  const cacheKey = `${collectionName}/${docId}`;
  docCache.delete(cacheKey);

  // Remove from collection cache in-place
  const cachedCol = collectionCache.get(collectionName);
  if (cachedCol) {
    cachedCol.data = cachedCol.data.filter(entry => entry.id !== docId);
  }

  if (checkFirestoreQuotaExhausted()) {
    return;
  }

  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection(collectionName).doc(docId).delete();
  } catch (err: any) {
    markFirestoreQuotaExhausted(err);
    console.error(`Firestore delete error [${collectionName}/${docId}]:`, err?.message || err);
  }
}

/**
 * Lists all documents with IDs in a collection, with in-memory caching, request deduplication,
 * and resilient local/seed disk fallback if Firestore quota is exhausted.
 */
export async function firestoreListDocs<T = any>(collectionName: string): Promise<FirestoreDocEntry<T>[]> {
  const now = Date.now();
  const ttl = getCollectionTTL(collectionName);
  const cached = collectionCache.get(collectionName);
  if (ttl > 0 && cached && (now - cached.cachedAt < ttl)) {
    return cached.data as FirestoreDocEntry<T>[];
  }

  if (inFlightLists.has(collectionName)) {
    return inFlightLists.get(collectionName) as Promise<FirestoreDocEntry<T>[]>;
  }

  // If quota is already exhausted, load from fallback documents immediately
  if (checkFirestoreQuotaExhausted()) {
    if (cached && cached.data.length > 0) return cached.data;
    const fallbacks = await loadFallbackDocs<T>(collectionName);
    if (fallbacks.length > 0) {
      collectionCache.set(collectionName, { data: fallbacks, cachedAt: Date.now() });
      return fallbacks;
    }
    return cached?.data ?? [];
  }

  const fetchPromise = (async () => {
    const db = getFirestoreDb();
    if (!db) {
      return await loadFallbackDocs<T>(collectionName);
    }

    try {
      const snap = await db.collection(collectionName).get();
      const entries: FirestoreDocEntry<T>[] = [];
      const fetchTime = Date.now();

      snap.forEach(doc => {
        const raw = doc.data();
        let unwrapped: any = raw;
        if (shouldUnwrapArray(collectionName, doc.id, raw)) {
          unwrapped = raw.items;
        }

        // Warm up document cache for free!
        docCache.set(`${collectionName}/${doc.id}`, { data: unwrapped, cachedAt: fetchTime });

        entries.push({
          id: doc.id,
          data: unwrapped as T
        });
      });

      // If Firestore returned 0 docs, supplement with fallback seed docs so data is never lost
      if (entries.length === 0) {
        const fallbacks = await loadFallbackDocs<T>(collectionName);
        if (fallbacks.length > 0) {
          collectionCache.set(collectionName, { data: fallbacks, cachedAt: fetchTime });
          return fallbacks;
        }
      }

      collectionCache.set(collectionName, { data: entries, cachedAt: fetchTime });
      return entries;
    } catch (err: any) {
      markFirestoreQuotaExhausted(err);
      console.error(`Firestore listDocs error [${collectionName}]:`, err?.message || err);
      // On quota error or network failure, return fallback seed/disk docs!
      const fallbacks = await loadFallbackDocs<T>(collectionName);
      if (fallbacks.length > 0) {
        collectionCache.set(collectionName, { data: fallbacks, cachedAt: Date.now() });
        return fallbacks;
      }
      return cached?.data ?? [];
    } finally {
      inFlightLists.delete(collectionName);
    }
  })();

  inFlightLists.set(collectionName, fetchPromise);
  return fetchPromise;
}

/**
 * Lists all unwrapped items in a collection.
 * If documents contain { items: [...] }, unwrapped items are returned.
 */
export async function firestoreList<T = any>(collectionName: string): Promise<T[]> {
  const docs = await firestoreListDocs<T>(collectionName);
  const results: T[] = [];
  for (const doc of docs) {
    // Only flatten if doc.data is a true array (e.g. messages or workspace members)
    if (Array.isArray(doc.data)) {
      results.push(...doc.data);
    } else {
      results.push(doc.data);
    }
  }
  return results;
}
