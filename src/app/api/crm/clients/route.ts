import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listClients, getClient, createClient, updateClient, deleteClient } from '@/lib/services/crm';
import { listWorkspaceMembers, checkWorkspaceAccess } from '@/lib/services/workspace';
import { safeReadFile, safeWriteFile, STORAGE_ROOT } from '@/lib/storage/storage';
import path from 'path';

const FIELD_LABELS: Record<string, string> = {
  companyName: 'Company',
  contactPerson: 'Contact Person',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  website: 'Website',
  industry: 'Industry',
  status: 'Status',
  avatarUrl: 'Avatar Icon',
  clientLocation: 'Location',
  clientType: 'Type',
  paymentSource: 'Payment Source',
  invoiceCurrency: 'Currency',
  gstTreatmentOverride: 'GST Treatment',
  gstNumber: 'GSTIN',
  placeOfSupply: 'Place of Supply',
  tags: 'Tags',
  notes: 'Dossier Notes'
};

// Helper to track pending client changes for Google Sheet sync
async function trackClientChange(
  workspaceId: string,
  clientId: string,
  companyName: string,
  changeType: 'created' | 'updated',
  details: string,
  fieldDiffs?: Array<{ field: string; label: string; oldValue: string; newValue: string }>
) {
  try {
    const syncFilePath = path.join(STORAGE_ROOT, 'workspaces', `${workspaceId}_sheet_sync.json`);
    const syncContent = await safeReadFile(syncFilePath);
    if (!syncContent) return;
    const syncConfig = JSON.parse(syncContent);
    syncConfig.pendingClientChanges = syncConfig.pendingClientChanges || {};

    const existingChange = syncConfig.pendingClientChanges[clientId];
    let mergedDiffs = fieldDiffs || [];

    if (existingChange?.fieldDiffs && fieldDiffs && fieldDiffs.length > 0) {
      const prevDiffsMap = new Map<string, { field: string; label: string; oldValue: string; newValue: string }>();
      existingChange.fieldDiffs.forEach((d: any) => prevDiffsMap.set(d.field, d));

      fieldDiffs.forEach(newD => {
        const prev = prevDiffsMap.get(newD.field);
        if (prev) {
          prevDiffsMap.set(newD.field, {
            ...newD,
            oldValue: prev.oldValue // preserve original value prior to modifications
          });
        } else {
          prevDiffsMap.set(newD.field, newD);
        }
      });
      mergedDiffs = Array.from(prevDiffsMap.values()).filter(d => d.oldValue !== d.newValue);
    }

    // Format human-friendly details summary with actual values
    let formattedDetails = details;
    if (mergedDiffs.length > 0) {
      formattedDetails = mergedDiffs
        .map(d => {
          const oldTxt = d.oldValue ? `${d.oldValue} → ` : '';
          return `${d.label}: ${oldTxt}${d.newValue || '(empty)'}`;
        })
        .join(' • ');
    }

    syncConfig.pendingClientChanges[clientId] = {
      clientId,
      companyName,
      changeType: existingChange?.changeType === 'created' ? 'created' : changeType,
      details: formattedDetails,
      changedAt: new Date().toISOString(),
      fieldDiffs: mergedDiffs
    };

    if (Array.isArray(syncConfig.syncedClientIds)) {
      syncConfig.syncedClientIds = syncConfig.syncedClientIds.filter((id: string) => id !== clientId);
    }
    await safeWriteFile(syncFilePath, JSON.stringify(syncConfig, null, 2));
  } catch (err) {
    console.warn('Failed to track client change in sheet sync config:', err);
  }
}

// Helper to remove client from pending changes & synced list on deletion
async function removeClientChange(workspaceId: string, clientId: string) {
  try {
    const syncFilePath = path.join(STORAGE_ROOT, 'workspaces', `${workspaceId}_sheet_sync.json`);
    const syncContent = await safeReadFile(syncFilePath);
    if (!syncContent) return;
    const syncConfig = JSON.parse(syncContent);
    if (syncConfig.pendingClientChanges && syncConfig.pendingClientChanges[clientId]) {
      delete syncConfig.pendingClientChanges[clientId];
    }
    if (Array.isArray(syncConfig.syncedClientIds)) {
      syncConfig.syncedClientIds = syncConfig.syncedClientIds.filter((id: string) => id !== clientId);
    }
    await safeWriteFile(syncFilePath, JSON.stringify(syncConfig, null, 2));
  } catch (err) {
    console.warn('Failed to remove client change in sheet sync config:', err);
  }
}

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string, role?: string): Promise<boolean> {
  return checkWorkspaceAccess(workspaceId, { id: userId, role });
}

// GET: Retrieve all clients in a workspace
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

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const clients = await listClients(workspaceId);
    return NextResponse.json(clients);
  } catch (error: any) {
    console.error('Clients GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new client profile
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      workspaceId, companyName, name, contactPerson, email, phone, address, website, industry, status, notes,
      clientLocation, clientType, paymentSource, invoiceCurrency, gstTreatmentOverride, gstNumber, placeOfSupply,
      avatarUrl, tags
    } = body;
    const resolvedCompanyName = (companyName || name || '').trim();
    const resolvedContactPerson = (contactPerson || resolvedCompanyName).trim();

    if (!workspaceId || !resolvedCompanyName) {
      return NextResponse.json({ error: 'workspaceId and companyName are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const client = await createClient(workspaceId, {
      companyName: resolvedCompanyName,
      contactPerson: resolvedContactPerson,
      email: email || '',
      phone: phone || '',
      address: address || '',
      website: website || '',
      industry: industry || '',
      status: status || 'active',
      notes: notes || '',
      avatarUrl: avatarUrl || null,
      tags: Array.isArray(tags) ? tags : [],
      // client master categorization fields (do not auto-add defaults unless provided)
      clientLocation: clientLocation || undefined,
      clientType: clientType || undefined,
      paymentSource: paymentSource || undefined,
      invoiceCurrency: invoiceCurrency || undefined,
      gstTreatmentOverride: gstTreatmentOverride || null,
      gstNumber: gstNumber || '',
      placeOfSupply: placeOfSupply || '',
      convertedFromLead: body.convertedFromLead || false,
      profileCompleted: body.profileCompleted ?? (!!(clientLocation && clientType))
    } as any);

    const initialDiffs: Array<{ field: string; label: string; oldValue: string; newValue: string }> = [];
    if (client.phone) initialDiffs.push({ field: 'phone', label: 'Phone', oldValue: '', newValue: client.phone });
    if (client.email) initialDiffs.push({ field: 'email', label: 'Email', oldValue: '', newValue: client.email });
    if (client.status) initialDiffs.push({ field: 'status', label: 'Status', oldValue: '', newValue: client.status.toUpperCase() });
    if (client.gstNumber) initialDiffs.push({ field: 'gstNumber', label: 'GSTIN', oldValue: '', newValue: client.gstNumber });

    await trackClientChange(workspaceId, client.id, client.companyName, 'created', 'New client registered', initialDiffs);

    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    console.error('Clients POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update client fields
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, workspaceId, ...updates } = body;

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'Client id and workspaceId are required' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const existingClient = await getClient(id);
    const client = await updateClient(id, updates);

    // Compute exact field-level diffs (only truly changed fields)
    const fieldDiffs: Array<{ field: string; label: string; oldValue: string; newValue: string }> = [];
    if (existingClient) {
      for (const [key, newVal] of Object.entries(updates)) {
        if (['id', 'workspaceId', 'updatedAt', 'createdAt', 'convertedFromLead', 'profileCompleted'].includes(key)) {
          continue;
        }

        const oldVal = (existingClient as any)[key];
        const strOld = Array.isArray(oldVal) ? oldVal.join(', ') : String(oldVal ?? '').trim();
        const strNew = Array.isArray(newVal) ? newVal.join(', ') : String(newVal ?? '').trim();

        if (strOld !== strNew) {
          const label = FIELD_LABELS[key] || key;
          fieldDiffs.push({
            field: key,
            label,
            oldValue: strOld,
            newValue: strNew
          });
        }
      }
    }

    const details = fieldDiffs.length > 0
      ? fieldDiffs.map(d => d.oldValue ? `${d.label}: ${d.oldValue} → ${d.newValue}` : `${d.label}: ${d.newValue}`).join(' • ')
      : 'Client details modified';

    await trackClientChange(
      workspaceId,
      id,
      client.companyName || updates.companyName || 'Client',
      'updated',
      details,
      fieldDiffs
    );

    return NextResponse.json(client);
  } catch (error: any) {
    console.error('Clients PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a client profile
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

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteClient(id);
    await removeClientChange(workspaceId, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Clients DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
