import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listInvoices, createInvoice, updateInvoice, deleteInvoice, getInvoice } from '@/lib/services/billing';
import { listClients, getClient } from '@/lib/services/crm';
import { listWorkspaceMembers, checkWorkspaceAccess } from '@/lib/services/workspace';
import { safeReadFile, safeWriteFile, STORAGE_ROOT } from '@/lib/storage/storage';
import path from 'path';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string, role?: string): Promise<boolean> {
  return checkWorkspaceAccess(workspaceId, { id: userId, role });
}

// GET: Retrieve all invoices in a workspace
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

    const invoices = await listInvoices(workspaceId);
    let clientMap = new Map<string, string>();
    try {
      const clients = await listClients(workspaceId);
      clientMap = new Map(clients.map(c => [c.id, c.companyName]));
    } catch {}

    const enrichedInvoices = invoices.map(inv => {
      let meta: any = {};
      try {
        if (inv.notes && inv.notes.startsWith('{')) meta = JSON.parse(inv.notes);
      } catch {}
      const clientName = clientMap.get(inv.clientId) || meta.clientName || 'Unnamed Client';
      return {
        ...inv,
        clientName
      };
    });

    return NextResponse.json(enrichedInvoices);
  } catch (error: any) {
    console.error('Invoices GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new invoice
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, clientId, invoiceNumber, issueDate, dueDate, items, total, discount, currency, notes, description, status } = body;

    if (!workspaceId || !clientId || !invoiceNumber || !issueDate || !dueDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const resolvedItems = Array.isArray(items) && items.length > 0
      ? items
      : [{
          description: description || notes || 'Invoice total',
          quantity: 1,
          unitPrice: Number(total || 0),
          taxRate: 0
        }];

    if (resolvedItems.some((item: { unitPrice?: number }) => Number.isNaN(Number(item.unitPrice)))) {
      return NextResponse.json({ error: 'A valid invoice total is required' }, { status: 400 });
    }

    const invoice = await createInvoice(workspaceId, {
      clientId,
      invoiceNumber,
      status: status || 'draft',
      issueDate,
      dueDate,
      items: resolvedItems,
      discount: Number(discount || 0),
      currency: currency || 'USD',
      notes: notes || description || ''
    });

    let clientName = 'Unnamed Client';
    try {
      const client = await getClient(clientId);
      if (client?.companyName) clientName = client.companyName;
    } catch {}

    return NextResponse.json({ ...invoice, clientName }, { status: 201 });
  } catch (error: any) {
    console.error('Invoices POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: Update invoice details
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, workspaceId, ...updates } = body;

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'Invoice id and workspaceId are required' }, { status: 400 });
    }

    const existingInvoice = await getInvoice(id);
    let prevNums: string[] = [];
    if (existingInvoice) {
      if (existingInvoice.previousInvoiceNumber) prevNums.push(existingInvoice.previousInvoiceNumber);
      if (Array.isArray(existingInvoice.previousInvoiceNumbers)) {
        existingInvoice.previousInvoiceNumbers.forEach(p => {
          if (p && !prevNums.includes(p)) prevNums.push(p);
        });
      }
      try {
        if (existingInvoice.notes && existingInvoice.notes.startsWith('{')) {
          const oldMeta = JSON.parse(existingInvoice.notes);
          if (Array.isArray(oldMeta.previousInvoiceNumbers)) {
            oldMeta.previousInvoiceNumbers.forEach((p: string) => {
              if (p && !prevNums.includes(p)) prevNums.push(p);
            });
          }
          if (oldMeta.previousInvoiceNumber && !prevNums.includes(oldMeta.previousInvoiceNumber)) {
            prevNums.push(oldMeta.previousInvoiceNumber);
          }
        }
      } catch {}

      if (updates.invoiceNumber && updates.invoiceNumber !== existingInvoice.invoiceNumber) {
        if (!prevNums.includes(existingInvoice.invoiceNumber)) {
          prevNums.unshift(existingInvoice.invoiceNumber);
        }
        updates.previousInvoiceNumber = existingInvoice.invoiceNumber;
      }
    }

    if (Array.isArray(updates.previousInvoiceNumbers)) {
      updates.previousInvoiceNumbers.forEach((p: string) => {
        if (p && !prevNums.includes(p)) prevNums.push(p);
      });
    }

    try {
      const allInvoices = await listInvoices(workspaceId);
      const currentInvoiceNum = String(updates.invoiceNumber || existingInvoice?.invoiceNumber || '').trim().toUpperCase();
      const otherActiveNumbers = new Set(
        allInvoices
          .filter(i => i.id !== id)
          .map(i => String(i.invoiceNumber || '').trim().toUpperCase())
          .filter(Boolean)
      );
      prevNums = prevNums.filter(p => {
        const upper = String(p || '').trim().toUpperCase();
        return upper && upper !== currentInvoiceNum && !otherActiveNumbers.has(upper);
      });
    } catch {}

    updates.previousInvoiceNumbers = prevNums;
    if (updates.previousInvoiceNumber) {
      const upperPrev = String(updates.previousInvoiceNumber).trim().toUpperCase();
      if (!prevNums.map(p => p.toUpperCase()).includes(upperPrev)) {
        updates.previousInvoiceNumber = prevNums[0] || '';
      }
    }

    const invoice = await updateInvoice(id, updates);

    // If an invoice is edited or any changes are made, immediately unmark it from sheet sync config
    try {
      const syncFilePath = path.join(STORAGE_ROOT, 'workspaces', `${workspaceId}_sheet_sync.json`);
      const syncContent = await safeReadFile(syncFilePath);
      if (syncContent) {
        const syncConfig = JSON.parse(syncContent);
        if (Array.isArray(syncConfig.syncedInvoiceIds) && syncConfig.syncedInvoiceIds.includes(id)) {
          syncConfig.syncedInvoiceIds = syncConfig.syncedInvoiceIds.filter((item: string) => item !== id);
          await safeWriteFile(syncFilePath, JSON.stringify(syncConfig, null, 2));
        }
      }
    } catch (syncErr) {
      console.warn('Failed to unmark invoice sync status on patch:', syncErr);
    }

    let meta: any = {};
    try {
      if (invoice.notes && invoice.notes.startsWith('{')) meta = JSON.parse(invoice.notes);
    } catch {}
    let clientName = meta.clientName || 'Unnamed Client';
    try {
      const client = await getClient(invoice.clientId);
      if (client?.companyName) clientName = client.companyName;
    } catch {}

    return NextResponse.json({ ...invoice, clientName });
  } catch (error: any) {
    console.error('Invoices PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete an invoice
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

    await deleteInvoice(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Invoices DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
