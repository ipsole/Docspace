import fs from 'fs/promises';
import path from 'path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import fsSync from 'fs';

// Load environment variables from .env.local if present
const envPath = path.join(process.cwd(), '.env.local');
if (fsSync.existsSync(envPath)) {
  const envContent = fsSync.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const STORAGE_ROOT = path.join(process.cwd(), 'storage');

// Data collections to sync to Firestore
const JSON_COLLECTIONS = [
  'workspaces',
  'users',
  'clients',
  'invoices',
  'conversations',
  'messages',
  'crm',
  'projects',
  'tasks',
  'boards',
  'calendar',
  'events',
  'settings',
  'templates'
];

// Media directories to sync to Cloudflare R2
const MEDIA_DIRS = [
  'uploads',
  'attachments',
  'avatars'
];

async function initFirebase(): Promise<Firestore | null> {
  const keyFileName = process.env.FIREBASE_KEY_FILE || 'docspace-7824a-firebase-adminsdk-fbsvc-6883ffaa25.json';
  const keyFilePath = path.isAbsolute(keyFileName)
    ? keyFileName
    : path.join(process.cwd(), keyFileName);

  try {
    const fileStat = await fs.stat(keyFilePath).catch(() => null);
    if (fileStat && fileStat.isFile()) {
      const raw = await fs.readFile(keyFilePath, 'utf-8');
      const serviceAccount = JSON.parse(raw);
      const app = getApps().length === 0
        ? initializeApp({
            credential: cert(serviceAccount),
          })
        : getApps()[0];
      return getFirestore(app);
    }
  } catch (err: any) {
    console.error('Error reading Firebase JSON key file:', err.message);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('⚠️  Firestore credentials not found in environment. Skipping Firestore migration.');
    return null;
  }

  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const app = getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      })
    : getApps()[0];

  return getFirestore(app);
}

function initR2(): { s3: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.warn('⚠️  Cloudflare R2 credentials not found in environment. Skipping R2 media migration.');
    return null;
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { s3, bucket };
}

async function runMigration() {
  console.log('🚀 Starting Cloud Migration (Firestore + Cloudflare R2)...\n');

  const db = await initFirebase();
  const r2 = initR2();

  if (!db && !r2) {
    console.error('❌ Neither Firestore nor R2 credentials were provided.');
    console.log('👉 Please fill in your .env.local file using .env.example as a guide.');
    process.exit(1);
  }

  // 1. Migrate JSON records to Firestore
  if (db) {
    console.log('📦 --- MIGRATING STRUCTURED DATA TO FIRESTORE ---');
    let totalDocs = 0;

    for (const collection of JSON_COLLECTIONS) {
      const dirPath = path.join(STORAGE_ROOT, collection);
      try {
        const files = await fs.readdir(dirPath);
        const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('._'));

        if (jsonFiles.length === 0) continue;

        console.log(`\n📁 Collection: "${collection}" (${jsonFiles.length} records)`);

        for (const file of jsonFiles) {
          const docId = file.replace(/\.json$/, '');
          const filePath = path.join(dirPath, file);
          const raw = await fs.readFile(filePath, 'utf-8');

          try {
            const data = JSON.parse(raw);
            const docData = Array.isArray(data) ? { items: data } : data;
            await db.collection(collection).doc(docId).set(docData, { merge: true });
            console.log(`  ✓ [${collection}] Synced: ${docId}`);
            totalDocs++;
          } catch (err: any) {
            console.error(`  ✕ Error parsing ${file}:`, err.message);
          }
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error(`Error reading ${dirPath}:`, err.message);
        }
      }
    }

    console.log(`\n🎉 Firestore Migration Complete! (${totalDocs} documents migrated)\n`);
  }

  // 2. Migrate Media & Files to Cloudflare R2
  if (r2) {
    console.log('☁️  --- MIGRATING MEDIA FILES TO CLOUDFLARE R2 ---');
    let totalFiles = 0;

    for (const mediaDir of MEDIA_DIRS) {
      const dirPath = path.join(STORAGE_ROOT, mediaDir);
      try {
        const files = await fs.readdir(dirPath);
        const validFiles = files.filter(f => !f.startsWith('.') && !f.startsWith('._'));

        if (validFiles.length === 0) continue;

        console.log(`\n📁 Uploading Folder: "${mediaDir}" (${validFiles.length} files)`);

        for (const file of validFiles) {
          const filePath = path.join(dirPath, file);
          const fileStat = await fs.stat(filePath);
          if (fileStat.isDirectory()) continue;

          const fileBuffer = await fs.readFile(filePath);
          const key = `${mediaDir}/${file}`;

          await r2.s3.send(
            new PutObjectCommand({
              Bucket: r2.bucket,
              Key: key,
              Body: fileBuffer,
            })
          );

          console.log(`  ✓ Uploaded to R2: ${key} (${(fileStat.size / 1024).toFixed(1)} KB)`);
          totalFiles++;
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error(`Error reading ${dirPath}:`, err.message);
        }
      }
    }

    console.log(`\n🎉 Cloudflare R2 Migration Complete! (${totalFiles} files uploaded)\n`);
  }

  console.log('✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY!');
}

runMigration().catch(err => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
