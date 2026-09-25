import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { updateUser } from '@/lib/storage/storage';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Update lastSeen timestamp on every request to /me
    const updatedUser = await updateUser(user.id, { lastSeen: new Date().toISOString() });

    const { passwordHash: _, ...userWithoutHash } = updatedUser;
    return NextResponse.json(userWithoutHash);
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
