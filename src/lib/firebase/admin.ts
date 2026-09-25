import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let appInstance: App | null = null;

export function getFirebaseAdminApp(): App | null {
  if (appInstance) return appInstance;
  if (getApps().length > 0) {
    appInstance = getApps()[0];
    return appInstance;
  }

  try {
    // 1. Try loading from service account JSON file if configured or found in root
    const keyFileName = process.env.FIREBASE_KEY_FILE || 'docspace-7824a-firebase-adminsdk-fbsvc-6883ffaa25.json';
    const keyFilePath = path.isAbsolute(keyFileName)
      ? keyFileName
      : path.join(process.cwd(), keyFileName);

    if (fs.existsSync(keyFilePath)) {
      const fileContent = fs.readFileSync(keyFilePath, 'utf-8');
      const serviceAccount = JSON.parse(fileContent);

      appInstance = initializeApp({
        credential: cert(serviceAccount),
      });
      return appInstance;
    }

    // 2. Try loading from FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 string, completely safe from false positives)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      try {
        const cleanB64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.replace(/^["']|["']$/g, '').trim();
        const decoded = Buffer.from(cleanB64, 'base64').toString('utf-8');
        const serviceAccount = JSON.parse(decoded);
        if (serviceAccount.private_key && serviceAccount.private_key.includes('\\n')) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        appInstance = initializeApp({
          credential: cert(serviceAccount),
        });
        return appInstance;
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:', e);
      }
    }

    // 3. Try loading from FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string, common on Vercel / Cloud)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        appInstance = initializeApp({
          credential: cert(serviceAccount),
        });
        return appInstance;
      } catch (e) {
        console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY as JSON:', e);
      }
    }

    // 4. Fall back to individual environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }

    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    appInstance = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return appInstance;
  } catch (err) {
    console.error('Failed to initialize Firebase Admin App:', err);
    return null;
  }
}

export function getFirestoreDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  const app = getFirebaseAdminApp();
  if (!app) return null;
  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}

export function getFirebaseAuth(): Auth | null {
  if (authInstance) return authInstance;
  const app = getFirebaseAdminApp();
  if (!app) return null;
  authInstance = getAuth(app);
  return authInstance;
}

export function isFirestoreEnabled(): boolean {
  return process.env.DATA_BACKEND === 'firestore' && Boolean(getFirestoreDb());
}
