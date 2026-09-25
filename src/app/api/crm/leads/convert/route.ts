import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLead, deleteLead, createClient, getClient } from '@/lib/services/crm';
import { listWorkspaceMembers, checkWorkspaceAccess } from '@/lib/services/workspace';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string, role?: string): Promise<boolean> {
  return checkWorkspaceAccess(workspaceId, { id: userId, role });
}

// POST: Convert a lead to a full Client and remove it from Leads pipeline
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { leadId, workspaceId, companyName, contactPerson, email, phone } = body;

    if (!leadId || !workspaceId) {
      return NextResponse.json({ error: 'leadId and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lead = await getLead(leadId);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    let client = null;

    // Only new prospects (not existing clients) can be marked as clients
    const isProspect = lead.leadType === 'new_prospect' || (!lead.clientId && !!(lead.companyName || companyName));

    if (!isProspect && lead.clientId) {
      return NextResponse.json({ error: 'This deal is already associated with an existing client and cannot be converted.' }, { status: 400 });
    }

    const resolvedCompanyName = (companyName || lead.companyName || lead.title).trim();
    const resolvedContactPerson = (contactPerson || lead.contactPerson || resolvedCompanyName).trim();

    // Create new client in the client category with ONLY provided details
    client = await createClient(workspaceId, {
      companyName: resolvedCompanyName,
      contactPerson: resolvedContactPerson,
      email: (email || lead.email || '').trim(),
      phone: (phone || lead.phone || '').trim(),
      address: '',
      website: '',
      industry: '',
      status: 'active',
      notes: lead.notes ? `Converted from Lead "${lead.title}": ${lead.notes}` : `Converted from Lead "${lead.title}"`,
      convertedFromLead: true,
      profileCompleted: false
    } as any);

    // Crucial requirement: "never shows up in the lead and will no longer exits in the lead category"
    await deleteLead(leadId);

    return NextResponse.json({
      success: true,
      client,
      message: 'Successfully marked as client and removed from Leads'
    });
  } catch (error: any) {
    console.error('Lead convert error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
