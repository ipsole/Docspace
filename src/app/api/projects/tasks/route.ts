import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listTasks, listTasksByProject, createTask, updateTask, deleteTask } from '@/lib/services/project';
import { listWorkspaceMembers } from '@/lib/services/workspace';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string): Promise<boolean> {
  const members = await listWorkspaceMembers(workspaceId);
  return members.some(m => m.userId === userId);
}

// GET: Retrieve tasks in a workspace (optionally filtered by projectId)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const projectId = searchParams.get('projectId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let tasks;
    if (projectId) {
      tasks = await listTasksByProject(projectId);
    } else {
      tasks = await listTasks(workspaceId);
    }

    return NextResponse.json(tasks);
  } catch (error: any) {
    console.error('Tasks GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new task inside a project
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      workspaceId, 
      projectId, 
      title, 
      description, 
      assigneeId, 
      dueDate, 
      dueTime,
      priority, 
      status,
      tags, 
      subtasks, 
      dependencies,
      money,
      clientId,
      comments,
      attachments
    } = body;

    if (!workspaceId || !projectId || !title) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const task = await createTask(workspaceId, projectId, {
      title,
      description: description || '',
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      priority: priority || 'medium',
      status: (status as 'todo' | 'in_progress' | 'review' | 'done') || 'todo',

      tags: tags || [],
      subtasks: subtasks || [],
      dependencies: dependencies || [],
      timeSpentSec: 0,
      money: money !== undefined ? money : null,
      clientId: clientId || null,
      comments: comments || [],
      attachments: attachments || []
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    console.error('Tasks POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update task fields
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, workspaceId, ...updates } = body;

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'Task id and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const task = await updateTask(id, updates);
    return NextResponse.json(task);
  } catch (error: any) {
    console.error('Tasks PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Remove a task
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

    await deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Tasks DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
