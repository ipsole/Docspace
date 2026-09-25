import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listAllWorkspaces } from '@/lib/services/workspace';

// GET: Retrieve all workspaces in the system
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaces = await listAllWorkspaces();
    return NextResponse.json(workspaces);
  } catch (error: any) {
    console.error('Workspaces All GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
