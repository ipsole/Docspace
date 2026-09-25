import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listLeads, createLead, updateLead, deleteLead } from '@/lib/services/crm';
import { listWorkspaceMembers } from '@/lib/services/workspace';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string): Promise<boolean> {
  const members = await listWorkspaceMembers(workspaceId);
  return members.some(m => m.userId === userId);
}

// GET: Retrieve all leads in a workspace
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

    const leads = await listLeads(workspaceId);
    return NextResponse.json(leads);
  } catch (error: any) {
    console.error('Leads GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new lead deal
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      workspaceId, clientId, leadType, companyName, contactPerson, email, phone,
      title, value, currency, stage, notes, nextFollowUp 
    } = body;

    const resolvedLeadType = leadType || (clientId ? 'existing_client' : 'new_prospect');

    if (!workspaceId || !title || value === undefined) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (resolvedLeadType === 'existing_client' && !clientId) {
      return NextResponse.json({ error: 'Client is required for existing client leads' }, { status: 400 });
    }

    if (resolvedLeadType === 'new_prospect' && !companyName && !title) {
      return NextResponse.json({ error: 'Prospect or company name is required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lead = await createLead(workspaceId, {
      clientId: resolvedLeadType === 'existing_client' ? clientId : (clientId || null),
      leadType: resolvedLeadType,
      companyName: (companyName || '').trim(),
      contactPerson: (contactPerson || '').trim(),
      email: (email || '').trim(),
      phone: (phone || '').trim(),
      title: title.trim(),
      value: Number(value),
      currency: currency || 'INR',
      stage: stage || 'lead',
      notes: notes || '',
      nextFollowUp: nextFollowUp || null
    } as any);

    return NextResponse.json(lead, { status: 201 });
  } catch (error: any) {
    console.error('Leads POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update lead details
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, workspaceId, ...updates } = body;

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'Lead id and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (updates.value !== undefined) {
      updates.value = Number(updates.value);
    }

    const lead = await updateLead(id, updates);
    return NextResponse.json(lead);
  } catch (error: any) {
    console.error('Leads PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a lead deal
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

    await deleteLead(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Leads DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
