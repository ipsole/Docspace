import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listProjects, createProject, updateProject, deleteProject } from '@/lib/services/project';
import { listWorkspaceMembers } from '@/lib/services/workspace';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string): Promise<boolean> {
  const members = await listWorkspaceMembers(workspaceId);
  return members.some(m => m.userId === userId);
}

// GET: Retrieve all projects in a workspace
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

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const projects = await listProjects(workspaceId);
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error('Projects GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new project
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, name, description, clientId, businessType, budget, startDate, endDate, members } = body;

    if (!workspaceId || !name) {
      return NextResponse.json({ error: 'workspaceId and name are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const project = await createProject(workspaceId, {
      clientId: clientId || null,
      businessType: businessType || '',
      name,
      description: description || '',
      status: 'planning',
      budget: Number(budget || 0),
      progress: 0,
      startDate: startDate || null,
      endDate: endDate || null,
      members: members || [user.id]
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    console.error('Projects POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update project details
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, workspaceId, ...updates } = body;

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'Project id and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (updates.budget !== undefined) {
      updates.budget = Number(updates.budget);
    }

    const project = await updateProject(id, updates);
    return NextResponse.json(project);
  } catch (error: any) {
    console.error('Projects PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a project
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

    await deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Projects DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
