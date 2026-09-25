import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listWikiPages, createWikiPage, updateWikiPage, deleteWikiPage, getWikiPage } from '@/lib/services/wiki';
import { listWorkspaceMembers } from '@/lib/services/workspace';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string): Promise<boolean> {
  const members = await listWorkspaceMembers(workspaceId);
  return members.some(m => m.userId === userId);
}

// GET: Retrieve all wiki pages in a workspace
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const id = searchParams.get('id');

    if (id) {
      const page = await getWikiPage(id);
      if (!page) {
        return NextResponse.json({ error: 'Page not found' }, { status: 404 });
      }
      if (!(await isUserMember(page.workspaceId, user.id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json(page);
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pages = await listWikiPages(workspaceId);
    return NextResponse.json(pages);
  } catch (error: any) {
    console.error('Wiki GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new wiki page
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, title, content, parentId, clientId, projectId } = body;

    if (!workspaceId || !title) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const page = await createWikiPage(
      workspaceId,
      user.id,
      title,
      content || '',
      parentId || null,
      {
        clientId: clientId || null,
        projectId: projectId || null
      }
    );

    return NextResponse.json(page, { status: 201 });
  } catch (error: any) {
    console.error('Wiki POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update wiki page content, title or parentId
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, workspaceId, ...updates } = body;

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'Page id and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const page = await updateWikiPage(id, updates);
    return NextResponse.json(page);
  } catch (error: any) {
    console.error('Wiki PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Remove a wiki page (and recursively its nested subpages)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const workspaceId = searchParams.get('workspaceId');

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteWikiPage(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Wiki DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
