import { NextRequest, NextResponse } from 'next/server';
import { endSession, getCurrentUser } from '@/lib/auth';
import { logInfo } from '@/lib/storage/logger';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (user) {
      await logInfo('AUTH', `User logged out: ${user.username}`, { userId: user.id, username: user.username });
    }
    
    await endSession();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
