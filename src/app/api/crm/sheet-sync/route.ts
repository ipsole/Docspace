import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers, getWorkspace } from '@/lib/services/workspace';
import { getInvoice, listInvoices } from '@/lib/services/billing';
import { getClient, listClients } from '@/lib/services/crm';
import { safeReadFile, safeWriteFile, STORAGE_ROOT } from '@/lib/storage/storage';
import path from 'path';

import { APPS_SCRIPT_TEMPLATE, SheetConfig } from '@/lib/services/sheetSyncTemplate';

const WORKSPACE_DIR = path.join(STORAGE_ROOT, 'workspaces');

async function callGoogleWebhook(url: string, payload: any) {
  const cleanUrl = url.trim().replace(/[\.,\s]+$/, '');
  if (cleanUrl.includes('docs.google.com/spreadsheets')) {
    throw new Error("You entered the Google Sheet spreadsheet link instead of the Apps Script Webhook URL. The Webhook URL is created by clicking 'Deploy > New deployment > Web app' in Google Apps Script and ends with '/exec'.");
  }

  let response: Response;
  try {
    response = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
  } catch (netErr: any) {
    throw new Error(`Failed to reach Google Apps Script: ${netErr?.message || netErr}. Please ensure the server has internet access and the URL is correct.`);
  }

  const text = await response.text();
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    if (text.includes('accounts.google.com') || text.includes('Sign in')) {
      throw new Error("Google permission denied. When creating the Web App deployment in Google Apps Script, make sure 'Who has access' is set to 'Anyone'.");
    }
    throw new Error(`Webhook returned unexpected response (Status: ${response.status}). Please verify your Apps Script deployment.`);
  }

  if (result && result.success === false) {
    throw new Error(result.error || 'Google Apps Script reported an error');
  }

  return result;
}

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

    const filePath = path.join(WORKSPACE_DIR, `${workspaceId}_sheet_sync.json`);
    const content = await safeReadFile(filePath);
    
    let config: SheetConfig = {
      workspaceId,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/1a0Xaf42WlDlA4tt4emgEp7ECpknC4a7pBfmtgJjwMe0/edit?gid=0#gid=0',
      webhookUrl: '',
    };

    if (content) {
      try {
        config = JSON.parse(content);
      } catch {}
    }

    return NextResponse.json({
      config,
      template: APPS_SCRIPT_TEMPLATE
    });
  } catch (error: any) {
    console.error('Sheet Sync GET error:', error);
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
    const { workspaceId, action, sheetUrl, webhookUrl, data, isFullSync, allActiveIds, allActiveNames, allActiveInvoiceNumbers, allActiveInvoiceIds } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const ws = await getWorkspace(workspaceId);
    const members = await listWorkspaceMembers(workspaceId);
    const member = members.find(m => m.userId === user.id);
    const isOwner = user.role === 'admin' || ws?.ownerId === user.id || member?.role === 'owner';
    if (!member && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const filePath = path.join(WORKSPACE_DIR, `${workspaceId}_sheet_sync.json`);
    const existingContent = await safeReadFile(filePath);
    let config: SheetConfig = {
      workspaceId,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/1a0Xaf42WlDlA4tt4emgEp7ECpknC4a7pBfmtgJjwMe0/edit?gid=0#gid=0',
      webhookUrl: '',
    };
    if (existingContent) {
      try {
        const parsed = JSON.parse(existingContent);
        config = { ...config, ...parsed };
      } catch {}
    }
    if (sheetUrl) config.sheetUrl = sheetUrl;
    if (webhookUrl) config.webhookUrl = webhookUrl;

    // 1. Action: Save configuration (strictly restricted to workspace owner / admin)
    if (action === 'save_config') {
      if (!isOwner) {
        return NextResponse.json({ 
          error: 'Forbidden: Only the workspace owner is authorized to edit or modify Google Sheet integration settings.' 
        }, { status: 403 });
      }
      await safeWriteFile(filePath, JSON.stringify(config, null, 2));
      return NextResponse.json({ success: true, config });
    }

    // Determine webhook URL to use
    const targetWebhook = webhookUrl || config.webhookUrl;
    if (!targetWebhook) {
      return NextResponse.json({
        error: 'Google Sheets Apps Script Webhook URL is not configured yet. Please set it in Sheet Settings.'
      }, { status: 400 });
    }

    // 2. Action: Test connection
    if (action === 'test_connection') {
      try {
        const result = await callGoogleWebhook(targetWebhook, { action: 'test_connection', data: {} });
        return NextResponse.json({ success: true, result });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err.message
        }, { status: 400 });
      }
    }

    // 3. Action: Sync Single Invoice
    if (action === 'sync_invoice') {
      try {
        // If this invoice previously had other numbers (e.g. was converted/switched from Tax to Proforma or Receipt),
        // remove the old number rows from the sheet so they don't remain as ghost duplicates.
        const prevNums: string[] = [];
        if (data?.previousInvoiceNumber) {
          prevNums.push(String(data.previousInvoiceNumber).trim());
        }
        if (Array.isArray(data?.previousInvoiceNumbers)) {
          data.previousInvoiceNumbers.forEach((p: string) => {
            const trimmed = String(p || '').trim();
            if (trimmed && !prevNums.includes(trimmed)) prevNums.push(trimmed);
          });
        }

        // Clean up previous rows from Google Sheet ONLY if they are NOT active invoices in the workspace
        const allInvoices = await listInvoices(workspaceId);
        const activeInvoiceNumbers = new Set(
          allInvoices.map(inv => String(inv.invoiceNumber || '').trim().toUpperCase())
        );

        const currentInvNum = String(data?.invoiceNumber || '').trim().toUpperCase();
        const sanitizedPrevNums = prevNums.filter(p => {
          const upper = p.toUpperCase();
          return upper && upper !== currentInvNum && !activeInvoiceNumbers.has(upper);
        });

        if (data) {
          data.previousInvoiceNumbers = sanitizedPrevNums;
          data.previousInvoiceNumber = sanitizedPrevNums[0] || '';
          data.allActiveInvoiceNumbers = Array.from(activeInvoiceNumbers);
        }

        for (const oldNum of sanitizedPrevNums) {
          try {
            await callGoogleWebhook(targetWebhook, {
              action: 'delete_invoice',
              data: { invoiceNumber: oldNum }
            });
          } catch (delErr) {
            console.warn(`Failed to cleanup previous invoice number ${oldNum} from sheet:`, delErr);
          }
        }

        // Ensure clientName and GST are never blank or "Unnamed Client"
        if (!data?.clientName || data?.clientName === 'Unnamed Client' || data?.clientName === 'Unknown Client' || !data?.clientGst) {
          try {
            const invoiceObj = data?.id ? await getInvoice(data.id) : null;
            const targetClientId = data?.clientId || invoiceObj?.clientId;
            if (targetClientId) {
              const cli = await getClient(targetClientId);
              if (cli) {
                if (!data.clientName || data.clientName === 'Unnamed Client' || data.clientName === 'Unknown Client') {
                  data.clientName = cli.companyName;
                }
                if (!data.clientGst && cli.gstNumber) {
                  data.clientGst = cli.gstNumber;
                }
                if (!data.placeOfSupply && cli.placeOfSupply) {
                  data.placeOfSupply = cli.placeOfSupply;
                }
                if (!data.paymentSource && cli.paymentSource) {
                  data.paymentSource = cli.paymentSource === 'foreign_remittance' ? 'Foreign Remittance' : cli.paymentSource === 'indian_bank' ? 'Indian Bank' : cli.paymentSource;
                }
              }
            }
          } catch {}
        }

        const result = await callGoogleWebhook(targetWebhook, { action: 'sync_invoice', data });

        config.lastInvoiceSync = new Date().toISOString();
        if (!config.syncedInvoiceIds) config.syncedInvoiceIds = [];
        if (data?.id && !config.syncedInvoiceIds.includes(data.id)) {
          config.syncedInvoiceIds.push(data.id);
        }
        await safeWriteFile(filePath, JSON.stringify(config, null, 2));

        return NextResponse.json({ success: true, result });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err.message
        }, { status: 400 });
      }
    }

    // 4. Action: Sync All Invoices / Selected Invoices
    if (action === 'sync_all_invoices') {
      try {
        const sortedData = Array.isArray(data)
          ? [...data].sort((a: any, b: any) => {
              const numA = String(a.invoiceNumber || '').trim();
              const numB = String(b.invoiceNumber || '').trim();
              return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
            })
          : data;

        if (Array.isArray(sortedData)) {
          try {
            const clients = await listClients(workspaceId);
            const clientMap = new Map(clients.map(c => [c.id, c]));
            for (const item of sortedData) {
              const cli = item.clientId ? clientMap.get(item.clientId) : null;
              if (cli) {
                if (!item.clientName || item.clientName === 'Unnamed Client' || item.clientName === 'Unknown Client') {
                  item.clientName = cli.companyName;
                }
                if (!item.clientGst && cli.gstNumber) {
                  item.clientGst = cli.gstNumber;
                }
                if (!item.placeOfSupply && cli.placeOfSupply) {
                  item.placeOfSupply = cli.placeOfSupply;
                }
              }
            }
          } catch {}
        }

        const result = await callGoogleWebhook(targetWebhook, {
          action: 'sync_all_invoices',
          data: sortedData,
          isFullSync,
          allActiveInvoiceNumbers,
          allActiveInvoiceIds: allActiveInvoiceIds || (Array.isArray(sortedData) ? sortedData.map((d: any) => d.id).filter(Boolean) : [])
        });

        config.lastInvoiceSync = new Date().toISOString();
        if (Array.isArray(sortedData)) {
          const ids = sortedData.map((d: any) => d.id).filter(Boolean);
          if (isFullSync) {
            config.syncedInvoiceIds = ids;
          } else {
            const current = new Set(config.syncedInvoiceIds || []);
            ids.forEach(id => current.add(id));
            config.syncedInvoiceIds = Array.from(current);
          }
        }
        await safeWriteFile(filePath, JSON.stringify(config, null, 2));

        return NextResponse.json({ success: true, result });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err.message
        }, { status: 400 });
      }
    }

    // 5. Action: Sync Clients / Selected Clients
    if (action === 'sync_clients') {
      try {
        const sortedData = Array.isArray(data)
          ? [...data].sort((a: any, b: any) => {
              const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              if (timeA !== timeB) return timeA - timeB;
              return String(a.companyName || '').localeCompare(String(b.companyName || ''));
            })
          : data;

        const result = await callGoogleWebhook(targetWebhook, {
          action: 'sync_clients',
          data: sortedData,
          isFullSync,
          allActiveIds,
          allActiveNames
        });

        config.lastClientSync = new Date().toISOString();
        if (!config.syncedClientIds) config.syncedClientIds = [];
        if (!config.pendingClientChanges) config.pendingClientChanges = {};

        if (Array.isArray(sortedData)) {
          const ids = sortedData.map((d: any) => d.id).filter(Boolean);
          if (isFullSync) {
            config.syncedClientIds = ids;
            config.pendingClientChanges = {};
          } else {
            const current = new Set(config.syncedClientIds || []);
            ids.forEach((id: string) => {
              current.add(id);
              if (config.pendingClientChanges && config.pendingClientChanges[id]) {
                delete config.pendingClientChanges[id];
              }
            });
            config.syncedClientIds = Array.from(current);
          }
        }
        await safeWriteFile(filePath, JSON.stringify(config, null, 2));

        return NextResponse.json({ 
          success: true, 
          result,
          syncedClientIds: config.syncedClientIds,
          pendingClientChanges: config.pendingClientChanges
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err.message
        }, { status: 400 });
      }
    }

    // 5b. Action: Sort Clients (Ascending by Created Date)
    if (action === 'sort_clients') {
      try {
        const result = await callGoogleWebhook(targetWebhook, { action: 'sort_clients' });
        return NextResponse.json({ success: true, result });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err.message
        }, { status: 400 });
      }
    }

    // 5c. Action: Dismiss Single Client Change Alert
    if (action === 'dismiss_client_change') {
      const clientId = data?.id;
      if (clientId && config.pendingClientChanges && config.pendingClientChanges[clientId]) {
        delete config.pendingClientChanges[clientId];
        await safeWriteFile(filePath, JSON.stringify(config, null, 2));
      }
      return NextResponse.json({ success: true, pendingClientChanges: config.pendingClientChanges || {} });
    }

    // 6. Action: Delete Single Invoice
    if (action === 'delete_invoice') {
      try {
        const result = await callGoogleWebhook(targetWebhook, { action: 'delete_invoice', data });
        if (config.syncedInvoiceIds && data?.id) {
          config.syncedInvoiceIds = config.syncedInvoiceIds.filter(id => id !== data.id);
          await safeWriteFile(filePath, JSON.stringify(config, null, 2));
        }
        return NextResponse.json({ success: true, result });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err.message
        }, { status: 400 });
      }
    }

    // 7. Action: Delete Single Client
    if (action === 'delete_client') {
      try {
        const result = await callGoogleWebhook(targetWebhook, { action: 'delete_client', data });
        return NextResponse.json({ success: true, result });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: err.message
        }, { status: 400 });
      }
    }

    // 8. Action: Mark Invoice Unsynced
    if (action === 'mark_invoice_unsynced' || action === 'unsync_invoice') {
      if (config.syncedInvoiceIds && data?.id) {
        config.syncedInvoiceIds = config.syncedInvoiceIds.filter(id => id !== data.id);
        await safeWriteFile(filePath, JSON.stringify(config, null, 2));
      }
      return NextResponse.json({ success: true, syncedInvoiceIds: config.syncedInvoiceIds || [] });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error: any) {
    console.error('Sheet Sync POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
