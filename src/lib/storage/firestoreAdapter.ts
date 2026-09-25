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

// TTL: 60 seconds by default (saves reads, instant page loads, write-through invalidates immediately)
const DEFAULT_TTL_MS = 60 * 1000;

// Individual document cache: key is "collection/docId"
const docCache = new Map<string, CacheEntry<any>>();

// Collection document-list cache: key is "collection"
const collectionCache = new Map<string, CacheEntry<FirestoreDocEntry<any>[]>>();

// In-flight deduplication promises
const inFlightGets = new Map<string, Promise<any>>();
const inFlightLists = new Map<string, Promise<any>>();

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
 * If data was a wrapped array, it unwraps it.
 */
export async function firestoreGet<T = any>(collectionName: string, docId: string): Promise<T | null> {
  const cacheKey = `${collectionName}/${docId}`;
  const now = Date.now();

  const cached = docCache.get(cacheKey);
  if (cached && (now - cached.cachedAt < DEFAULT_TTL_MS)) {
    return cached.data as T;
  }

  // Deduplicate in-flight get requests
  if (inFlightGets.has(cacheKey)) {
    return inFlightGets.get(cacheKey) as Promise<T | null>;
  }

  const fetchPromise = (async () => {
    const db = getFirestoreDb();
    if (!db) return null;

    try {
      const docSnap = await db.collection(collectionName).doc(docId).get();
      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      let unwrapped: any = data;
      if (data && shouldUnwrapArray(collectionName, docId, data)) {
        unwrapped = (data as Record<string, unknown>).items;
      }

      docCache.set(cacheKey, { data: unwrapped, cachedAt: Date.now() });
      return unwrapped as T;
    } catch (err) {
      console.error(`Firestore get error [${collectionName}/${docId}]:`, err);
      return null;
    } finally {
      inFlightGets.delete(cacheKey);
    }
  })();

  inFlightGets.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Saves a document to Firestore with write-through cache update.
 */
export async function firestoreSet(collectionName: string, docId: string, data: any): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const cacheKey = `${collectionName}/${docId}`;

  // Update in-memory document cache immediately
  docCache.set(cacheKey, { data, cachedAt: Date.now() });
  // Invalidate collection cache so fresh list will be generated
  collectionCache.delete(collectionName);

  try {
    // Recursively clean undefined values which Firestore rejects
    const cleaned = data === undefined ? null : JSON.parse(JSON.stringify(data));
    const docData = Array.isArray(cleaned) ? { _isArrayWrapper: true, items: cleaned } : cleaned;
    await db.collection(collectionName).doc(docId).set(docData, { merge: true });
  } catch (err) {
    console.error(`Firestore set error [${collectionName}/${docId}]:`, err);
    throw err;
  }
}

/**
 * Deletes a document from Firestore with cache invalidation.
 */
export async function firestoreDelete(collectionName: string, docId: string): Promise<void> {
  const cacheKey = `${collectionName}/${docId}`;
  docCache.delete(cacheKey);
  collectionCache.delete(collectionName);

  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db.collection(collectionName).doc(docId).delete();
  } catch (err) {
    console.error(`Firestore delete error [${collectionName}/${docId}]:`, err);
  }
}

/**
 * Lists all documents with IDs in a collection, with in-memory caching and request deduplication.
 */
export async function firestoreListDocs<T = any>(collectionName: string): Promise<FirestoreDocEntry<T>[]> {
  const now = Date.now();
  const cached = collectionCache.get(collectionName);
  if (cached && (now - cached.cachedAt < DEFAULT_TTL_MS)) {
    return cached.data as FirestoreDocEntry<T>[];
  }

  if (inFlightLists.has(collectionName)) {
    return inFlightLists.get(collectionName) as Promise<FirestoreDocEntry<T>[]>;
  }

  const fetchPromise = (async () => {
    const db = getFirestoreDb();
    if (!db) return [];

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

      collectionCache.set(collectionName, { data: entries, cachedAt: fetchTime });
      return entries;
    } catch (err) {
      console.error(`Firestore listDocs error [${collectionName}]:`, err);
      return [];
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
