import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers, addMemberToWorkspace, updateMemberInWorkspace, removeMemberFromWorkspace, getWorkspace } from '@/lib/services/workspace';
import { readUserByUsername, listUsers, createUser, type User } from '@/lib/storage/storage';

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
    
    // Check if the current user is a member of this workspace
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(members);
  } catch (error: any) {
    console.error('Workspace members GET error:', error);
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
    const { workspaceId, userId, username, email, name, role = 'member', allowedSections, tabPermissions } = body;

    if (!workspaceId || (!userId && !username && !email)) {
      return NextResponse.json({ error: 'workspaceId and either email, userId, or username are required' }, { status: 400 });
    }

    const [members, workspace] = await Promise.all([
      listWorkspaceMembers(workspaceId),
      getWorkspace(workspaceId),
    ]);
    
    // Only the workspace owner can add team members
    const currentMember = members.find(m => m.userId === user.id);
    const isOwner = (workspace && workspace.ownerId === user.id) || currentMember?.role === 'owner';

    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden: Only the workspace owner can add team members' }, { status: 403 });
    }

    let resolvedUserId = userId;
    if (!resolvedUserId && email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        return NextResponse.json({ error: 'Please enter a valid Google / Gmail address' }, { status: 400 });
      }

      const allUsers = await listUsers();
      let targetUser = allUsers.find(u => u.email.toLowerCase() === normalizedEmail);

      if (!targetUser) {
        // Create a new authorized user record for this Google account
        const emailPrefix = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_');
        let uniqueUsername = emailPrefix;
        let counter = 1;
        while (allUsers.some(u => u.username.toLowerCase() === uniqueUsername.toLowerCase())) {
          uniqueUsername = `${emailPrefix}_${counter++}`;
        }

        const newUserData: User = {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          username: uniqueUsername,
          displayName: (name && String(name).trim()) || (emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)),
          email: normalizedEmail,
          passwordHash: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          avatar: null,
          lastSeen: new Date().toISOString(),
          status: 'offline',
          preferences: {},
          theme: 'system',
          role: 'user',
          bio: 'Authorized Google workspace team member',
        };

        targetUser = await createUser(newUserData);
      }
      resolvedUserId = targetUser.id;
    } else if (!resolvedUserId && username) {
      const normalizedUsername = String(username).trim().replace(/^@/, '');
      const targetUser = await readUserByUsername(normalizedUsername);
      if (!targetUser) {
        return NextResponse.json({ error: 'No user found with that username' }, { status: 404 });
      }
      resolvedUserId = targetUser.id;
    }

    const alreadyMember = members.some(m => m.userId === resolvedUserId);
    if (alreadyMember) {
      return NextResponse.json({ error: 'This Google account or user is already a member of this workspace' }, { status: 409 });
    }

    const newMember = await addMemberToWorkspace(workspaceId, resolvedUserId, role, allowedSections, tabPermissions);
    return NextResponse.json(newMember);
  } catch (error: any) {
    console.error('Workspace members POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, userId, role, allowedSections, tabPermissions } = body;

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'workspaceId and userId are required' }, { status: 400 });
    }

    const [members, workspace] = await Promise.all([
      listWorkspaceMembers(workspaceId),
      getWorkspace(workspaceId),
    ]);
    const currentMember = members.find(m => m.userId === user.id);
    const isOwner = (workspace && workspace.ownerId === user.id) || currentMember?.role === 'owner';

    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden: Only the workspace owner can edit access permissions' }, { status: 403 });
    }

    const targetMember = members.find(m => m.userId === userId);
    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Only owner can modify another owner
    if (targetMember.role === 'owner' && !isOwner) {
      return NextResponse.json({ error: 'Only workspace owner can modify an owner' }, { status: 403 });
    }

    const updated = await updateMemberInWorkspace(workspaceId, userId, {
      role,
      allowedSections,
      tabPermissions
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Workspace members PUT error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userId = searchParams.get('userId');

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'workspaceId and userId are required' }, { status: 400 });
    }

    const [members, workspace] = await Promise.all([
      listWorkspaceMembers(workspaceId),
      getWorkspace(workspaceId),
    ]);
    
    // Check permissions:
    // 1. User can remove themselves (leave workspace)
    // 2. Only Workspace Owner can remove anyone else
    const currentMember = members.find(m => m.userId === user.id);
    if (!currentMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isSelfRemove = user.id === userId;
    const isOwner = (workspace && workspace.ownerId === user.id) || currentMember.role === 'owner';

    if (!isSelfRemove && !isOwner) {
      return NextResponse.json({ error: 'Forbidden: Only the workspace owner can remove workspace members' }, { status: 403 });
    }

    const targetMember = members.find(m => m.userId === userId);
    if (targetMember?.role === 'owner' && !isSelfRemove && !isOwner) {
      return NextResponse.json({ error: 'Cannot remove the workspace owner' }, { status: 403 });
    }

    // Prevent leaving if they are the owner and there are no other members (or must delegate owner first)
    if (isSelfRemove && currentMember.role === 'owner') {
      const otherOwnerExists = members.some(m => m.userId !== user.id && m.role === 'owner');
      if (!otherOwnerExists) {
        return NextResponse.json({ error: 'As the owner, you must delete the workspace or delegate ownership first' }, { status: 400 });
      }
    }

    await removeMemberFromWorkspace(workspaceId, userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Workspace members DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
