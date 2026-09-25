import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    time: new Date().toISOString(),
    env: {
      hasDataBackend: Boolean(process.env.DATA_BACKEND),
      dataBackend: process.env.DATA_BACKEND || 'not-set',
      hasFirebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
      hasFirebaseBase64: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64),
      hasR2Account: Boolean(process.env.R2_ACCOUNT_ID)
    }
  });
}
