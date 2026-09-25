import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers } from '@/lib/services/workspace';
import { safeReadFile, safeWriteFile, STORAGE_ROOT } from '@/lib/storage/storage';
import path from 'path';

const WORKSPACE_DIR = path.join(STORAGE_ROOT, 'workspaces');

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const members = await listWorkspaceMembers(workspaceId);
    const member = members.find(m => m.userId === user.id);
    if (!member && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check tab permission
    if (user.role !== 'admin' && member?.role !== 'owner' && member?.role !== 'manager') {
      const billingPerm = member?.tabPermissions?.['billing'];
      if (!billingPerm || billingPerm === 'none') {
        return NextResponse.json({ error: 'Forbidden: No billing access' }, { status: 403 });
      }
    }

    const filePath = path.join(WORKSPACE_DIR, `${workspaceId}_expenses.json`);
    const content = await safeReadFile(filePath);
    if (!content) {
      return NextResponse.json(null);
    }

    const expenses = JSON.parse(content);
    return NextResponse.json(expenses);
  } catch (error: any) {
    console.error('Expenses GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, expenses } = body;

    if (!workspaceId || !Array.isArray(expenses)) {
      return NextResponse.json({ error: 'workspaceId and expenses array are required' }, { status: 400 });
    }

    const members = await listWorkspaceMembers(workspaceId);
    const member = members.find(m => m.userId === user.id);
    if (!member && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check tab permission
    if (user.role !== 'admin' && member?.role !== 'owner' && member?.role !== 'manager') {
      const billingPerm = member?.tabPermissions?.['billing'];
      if (!billingPerm || billingPerm === 'none' || billingPerm === 'view') {
        return NextResponse.json({ error: 'Forbidden: Write access required' }, { status: 403 });
      }
    }

    const filePath = path.join(WORKSPACE_DIR, `${workspaceId}_expenses.json`);
    await safeWriteFile(filePath, JSON.stringify(expenses, null, 2));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Expenses POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
