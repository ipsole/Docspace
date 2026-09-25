import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreDb, isFirestoreEnabled } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isFirestoreEnabled()) {
      const db = getFirestoreDb();
      if (db) {
        // Lightweight 1-doc query to establish gRPC TLS channel and OAuth credentials ahead of time
        await db.collection('workspaces').limit(1).get().catch(() => null);
      }
    }
    return NextResponse.json({ ok: true, warm: true, timestamp: Date.now() });
  } catch (err: any) {
    return NextResponse.json({ ok: true, warm: false, error: err?.message }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
