import fs from 'fs/promises';
import path from 'path';
import { Client, CRMLead } from '../storage/models';
import { safeReadFile, safeWriteFile, safeDeleteFile, STORAGE_ROOT } from '../storage/storage';
import { isFirestoreEnabled, firestoreList } from '../storage/firestoreAdapter';
import { v4 as uuidv4 } from 'uuid';
import { recalculateProjectProgress } from './project';

const CLIENTS_DIR = path.join(STORAGE_ROOT, 'clients');
const CRM_DIR = path.join(STORAGE_ROOT, 'crm');

// Ensure directories exist
async function ensureDirs() {
  await fs.mkdir(CLIENTS_DIR, { recursive: true });
  await fs.mkdir(CRM_DIR, { recursive: true });
}

// --- CLIENT OPERATIONS ---

export async function listClients(workspaceId: string): Promise<Client[]> {
  if (isFirestoreEnabled()) {
    const allClients = await firestoreList<Client>('clients');
    return allClients
      .filter(c => c && c.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  await ensureDirs();
  // Auto-prune any orphaned records referencing deleted or non-existing clients
  await purgeOrphanClientData();

  const files = await fs.readdir(CLIENTS_DIR).catch(() => []);
  const clients: Client[] = [];

  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('._')) {
      const content = await safeReadFile(path.join(CLIENTS_DIR, file));
      if (content) {
        try {
          const client = JSON.parse(content) as Client;
          if (client.workspaceId === workspaceId) {
            clients.push(client);
          }
        } catch {}
      }
    }
  }

  return clients.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getClient(id: string): Promise<Client | null> {
  await ensureDirs();
  const content = await safeReadFile(path.join(CLIENTS_DIR, `${id}.json`));
  if (!content) return null;
  return JSON.parse(content) as Client;
}

export async function createClient(
  workspaceId: string,
  data: Omit<Client, 'id' | 'workspaceId' | 'createdAt'>
): Promise<Client> {
  await ensureDirs();
  const id = uuidv4();
  const client: Client = {
    id,
    workspaceId,
    ...data,
    createdAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(CLIENTS_DIR, `${id}.json`), JSON.stringify(client, null, 2));
  return client;
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<Client> {
  const client = await getClient(id);
  if (!client) throw new Error('Client not found');

  const updatedClient = {
    ...client,
    ...updates
  };

  await safeWriteFile(path.join(CLIENTS_DIR, `${id}.json`), JSON.stringify(updatedClient, null, 2));
  return updatedClient;
}

export async function deleteClient(id: string): Promise<void> {
  await ensureDirs();
  await safeDeleteFile(path.join(CLIENTS_DIR, `${id}.json`));
  
  // 1. Clean up CRM leads
  const crmFiles = await fs.readdir(CRM_DIR).catch(() => []);
  for (const file of crmFiles) {
    if (file.endsWith('.json') && !file.startsWith('._')) {
      const filePath = path.join(CRM_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const lead = JSON.parse(content) as CRMLead;
          if (lead.clientId === id) {
            await safeDeleteFile(filePath);
          }
        } catch {}
      }
    }
  }

  // 2. Clean up Tasks referencing this client
  const TASKS_DIR = path.join(STORAGE_ROOT, 'tasks');
  const affectedProjectIds = new Set<string>();
  if (await fs.stat(TASKS_DIR).then(() => true).catch(() => false)) {
    const taskFiles = await fs.readdir(TASKS_DIR);
    for (const file of taskFiles) {
      if (file.endsWith('.json') && !file.startsWith('._')) {
        const filePath = path.join(TASKS_DIR, file);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const task = JSON.parse(content);
            if (task.clientId === id) {
              if (task.projectId) affectedProjectIds.add(task.projectId);
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 3. Clean up Calendar events / meetings referencing this client
  const CALENDAR_DIR = path.join(STORAGE_ROOT, 'calendar');
  if (await fs.stat(CALENDAR_DIR).then(() => true).catch(() => false)) {
    const calFiles = await fs.readdir(CALENDAR_DIR);
    for (const file of calFiles) {
      if (file.endsWith('.json') && !file.startsWith('._')) {
        const filePath = path.join(CALENDAR_DIR, file);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const ev = JSON.parse(content);
            if (ev.clientId === id) {
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 4. Clean up Invoices referencing this client
  const INVOICES_DIR = path.join(STORAGE_ROOT, 'invoices');
  if (await fs.stat(INVOICES_DIR).then(() => true).catch(() => false)) {
    const invFiles = await fs.readdir(INVOICES_DIR);
    for (const file of invFiles) {
      if (file.endsWith('.json') && !file.startsWith('._')) {
        const filePath = path.join(INVOICES_DIR, file);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const inv = JSON.parse(content);
            if (inv.clientId === id) {
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 5. Clean up Documents referencing this client
  const DOCS_DIR = path.join(STORAGE_ROOT, 'documents');
  if (await fs.stat(DOCS_DIR).then(() => true).catch(() => false)) {
    const docFiles = await fs.readdir(DOCS_DIR);
    for (const file of docFiles) {
      if (file.endsWith('.json') && !file.startsWith('._')) {
        const filePath = path.join(DOCS_DIR, file);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const doc = JSON.parse(content);
            if (doc.clientId === id) {
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 6. Clean up Conversations and messages referencing this client
  const CONV_DIR = path.join(STORAGE_ROOT, 'conversations');
  const MSG_DIR = path.join(STORAGE_ROOT, 'messages');
  if (await fs.stat(CONV_DIR).then(() => true).catch(() => false)) {
    const convFiles = await fs.readdir(CONV_DIR);
    for (const file of convFiles) {
      if (file.endsWith('.json') && !file.startsWith('._')) {
        const filePath = path.join(CONV_DIR, file);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const conv = JSON.parse(content);
            if (conv.clientId === id) {
              await safeDeleteFile(filePath);
              await safeDeleteFile(path.join(MSG_DIR, file)).catch(() => {});
            }
          } catch {}
        }
      }
    }
  }

  // 7. Clean up Projects referencing this client (and their tasks)
  const PROJECTS_DIR = path.join(STORAGE_ROOT, 'projects');
  if (await fs.stat(PROJECTS_DIR).then(() => true).catch(() => false)) {
    const projFiles = await fs.readdir(PROJECTS_DIR);
    for (const file of projFiles) {
      if (file.endsWith('.json') && !file.startsWith('._')) {
        const filePath = path.join(PROJECTS_DIR, file);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const proj = JSON.parse(content);
            if (proj.clientId === id) {
              if (await fs.stat(TASKS_DIR).then(() => true).catch(() => false)) {
                const tFiles = await fs.readdir(TASKS_DIR);
                for (const tFile of tFiles) {
                  if (tFile.endsWith('.json') && !tFile.startsWith('._')) {
                    const tPath = path.join(TASKS_DIR, tFile);
                    const tContent = await safeReadFile(tPath);
                    if (tContent) {
                      try {
                        const t = JSON.parse(tContent);
                        if (t.projectId === proj.id) {
                          await safeDeleteFile(tPath);
                        }
                      } catch {}
                    }
                  }
                }
              }
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // Recalculate progress for any affected projects
  for (const projId of affectedProjectIds) {
    try {
      await recalculateProjectProgress(projId);
    } catch {}
  }

  // Run thorough purge sweep
  await purgeOrphanClientData();
}

/**
 * Purges any orphan tasks, calendar meetings/deadlines, projects, invoices, leads, docs, or conversations
 * that reference a clientId that does not exist in storage/clients (whether active or inactive).
 */
export async function purgeOrphanClientData(): Promise<void> {
  await ensureDirs();
  const validClientIds = new Set<string>();

  if (isFirestoreEnabled()) {
    const clients = await firestoreList<Client>('clients');
    for (const c of clients) {
      if (c && c.id) validClientIds.add(c.id);
    }
  } else {
    const clientFiles = await fs.readdir(CLIENTS_DIR).catch(() => []);
    for (const f of clientFiles) {
      if (f.endsWith('.json') && !f.startsWith('._')) {
        validClientIds.add(f.replace('.json', ''));
      }
    }
  }

  const affectedProjectIds = new Set<string>();

  // 1. Tasks
  const TASKS_DIR = path.join(STORAGE_ROOT, 'tasks');
  if (await fs.stat(TASKS_DIR).then(() => true).catch(() => false)) {
    const taskFiles = await fs.readdir(TASKS_DIR);
    for (const f of taskFiles) {
      if (f.endsWith('.json') && !f.startsWith('._')) {
        const filePath = path.join(TASKS_DIR, f);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const task = JSON.parse(content);
            if (task.clientId && !validClientIds.has(task.clientId)) {
              if (task.projectId) affectedProjectIds.add(task.projectId);
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 2. Calendar events and meetings
  const CALENDAR_DIR = path.join(STORAGE_ROOT, 'calendar');
  if (await fs.stat(CALENDAR_DIR).then(() => true).catch(() => false)) {
    const calFiles = await fs.readdir(CALENDAR_DIR);
    for (const f of calFiles) {
      if (f.endsWith('.json') && !f.startsWith('._')) {
        const filePath = path.join(CALENDAR_DIR, f);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const ev = JSON.parse(content);
            if (ev.clientId && !validClientIds.has(ev.clientId)) {
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 3. Projects referencing non-existent clients
  const PROJECTS_DIR = path.join(STORAGE_ROOT, 'projects');
  if (await fs.stat(PROJECTS_DIR).then(() => true).catch(() => false)) {
    const projFiles = await fs.readdir(PROJECTS_DIR);
    for (const f of projFiles) {
      if (f.endsWith('.json') && !f.startsWith('._')) {
        const filePath = path.join(PROJECTS_DIR, f);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const proj = JSON.parse(content);
            if (proj.clientId && !validClientIds.has(proj.clientId)) {
              if (await fs.stat(TASKS_DIR).then(() => true).catch(() => false)) {
                const tFiles = await fs.readdir(TASKS_DIR);
                for (const tFile of tFiles) {
                  if (tFile.endsWith('.json') && !tFile.startsWith('._')) {
                    const tPath = path.join(TASKS_DIR, tFile);
                    const tContent = await safeReadFile(tPath);
                    if (tContent) {
                      try {
                        const t = JSON.parse(tContent);
                        if (t.projectId === proj.id) {
                          await safeDeleteFile(tPath);
                        }
                      } catch {}
                    }
                  }
                }
              }
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 4. CRM Leads
  const crmFiles = await fs.readdir(CRM_DIR).catch(() => []);
  for (const f of crmFiles) {
    if (f.endsWith('.json') && !f.startsWith('._')) {
      const filePath = path.join(CRM_DIR, f);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const lead = JSON.parse(content);
          if (lead.clientId && !validClientIds.has(lead.clientId)) {
            await safeDeleteFile(filePath);
          }
        } catch {}
      }
    }
  }

  // 5. Invoices
  const INVOICES_DIR = path.join(STORAGE_ROOT, 'invoices');
  if (await fs.stat(INVOICES_DIR).then(() => true).catch(() => false)) {
    const invFiles = await fs.readdir(INVOICES_DIR);
    for (const f of invFiles) {
      if (f.endsWith('.json') && !f.startsWith('._')) {
        const filePath = path.join(INVOICES_DIR, f);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const inv = JSON.parse(content);
            if (inv.clientId && !validClientIds.has(inv.clientId)) {
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 6. Documents
  const DOCS_DIR = path.join(STORAGE_ROOT, 'documents');
  if (await fs.stat(DOCS_DIR).then(() => true).catch(() => false)) {
    const docFiles = await fs.readdir(DOCS_DIR);
    for (const f of docFiles) {
      if (f.endsWith('.json') && !f.startsWith('._')) {
        const filePath = path.join(DOCS_DIR, f);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const doc = JSON.parse(content);
            if (doc.clientId && !validClientIds.has(doc.clientId)) {
              await safeDeleteFile(filePath);
            }
          } catch {}
        }
      }
    }
  }

  // 7. Conversations
  const CONV_DIR = path.join(STORAGE_ROOT, 'conversations');
  const MSG_DIR = path.join(STORAGE_ROOT, 'messages');
  if (await fs.stat(CONV_DIR).then(() => true).catch(() => false)) {
    const convFiles = await fs.readdir(CONV_DIR);
    for (const f of convFiles) {
      if (f.endsWith('.json') && !f.startsWith('._')) {
        const filePath = path.join(CONV_DIR, f);
        const content = await safeReadFile(filePath);
        if (content) {
          try {
            const c = JSON.parse(content);
            if (c.clientId && !validClientIds.has(c.clientId)) {
              await safeDeleteFile(filePath);
              await safeDeleteFile(path.join(MSG_DIR, f)).catch(() => {});
            }
          } catch {}
        }
      }
    }
  }

  for (const projId of affectedProjectIds) {
    try {
      await recalculateProjectProgress(projId);
    } catch {}
  }
}

// --- CRM LEAD OPERATIONS ---

export async function listLeads(workspaceId: string): Promise<CRMLead[]> {
  if (isFirestoreEnabled()) {
    const allLeads = await firestoreList<CRMLead>('crm');
    return allLeads
      .filter(l => l && l.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  await ensureDirs();
  const files = await fs.readdir(CRM_DIR).catch(() => []);
  const leads: CRMLead[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await safeReadFile(path.join(CRM_DIR, file));
      if (content) {
        try {
          const lead = JSON.parse(content) as CRMLead;
          if (lead.workspaceId === workspaceId) {
            leads.push(lead);
          }
        } catch {}
      }
    }
  }

  return leads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getLead(id: string): Promise<CRMLead | null> {
  await ensureDirs();
  const content = await safeReadFile(path.join(CRM_DIR, `${id}.json`));
  if (!content) return null;
  return JSON.parse(content) as CRMLead;
}

export async function createLead(
  workspaceId: string,
  data: Omit<CRMLead, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>
): Promise<CRMLead> {
  await ensureDirs();
  const id = uuidv4();
  const now = new Date().toISOString();
  
  const lead: CRMLead = {
    id,
    workspaceId,
    ...data,
    createdAt: now,
    updatedAt: now
  };

  await safeWriteFile(path.join(CRM_DIR, `${id}.json`), JSON.stringify(lead, null, 2));
  return lead;
}

export async function updateLead(id: string, updates: Partial<CRMLead>): Promise<CRMLead> {
  const lead = await getLead(id);
  if (!lead) throw new Error('Lead not found');

  const updatedLead = {
    ...lead,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(CRM_DIR, `${id}.json`), JSON.stringify(updatedLead, null, 2));
  return updatedLead;
}

export async function deleteLead(id: string): Promise<void> {
  await safeDeleteFile(path.join(CRM_DIR, `${id}.json`));
}
