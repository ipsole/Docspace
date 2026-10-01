/**
 * Cross-tab & Cross-page Real-time Synchronization Utility for Docspace.
 * Ensures zero-lag instantaneous updates across:
 * 1. BroadcastChannel (for other open browser tabs / windows)
 * 2. Window CustomEvents (for 0ms sync within the current tab / SPA navigation)
 * 3. SessionStorage Caches (so page transitions immediately mount with fresh state)
 */

export type SyncChannel = 
  | 'docspace_task_status'
  | 'docspace_project_status'
  | 'docspace_invoice_status'
  | 'docspace_client_status'
  | 'docspace_calendar_events';

// Map of persistent broadcast channels to avoid premature garbage collection or close races
const channelMap = new Map<string, BroadcastChannel>();

function getBroadcastChannel(name: string): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!('BroadcastChannel' in window)) return null;
  try {
    let bc = channelMap.get(name);
    if (!bc) {
      bc = new BroadcastChannel(name);
      channelMap.set(name, bc);
    }
    return bc;
  } catch {
    return null;
  }
}

/**
 * Updates a task's status across ALL relevant sessionStorage caches:
 * - cached_projects_list (projects with nested tasks)
 * - cached_crm_tasks (standalone task list)
 */
export function syncTaskToSessionCaches(taskId: string, status: string, additionalUpdates?: Record<string, any>): void {
  if (typeof window === 'undefined') return;

  // 1. Update cached_projects_list
  try {
    const rawProjects = sessionStorage.getItem('cached_projects_list');
    if (rawProjects) {
      const projects = JSON.parse(rawProjects);
      let changed = false;
      const updatedProjects = projects.map((p: any) => {
        const tasks = p.tasks || [];
        if (!tasks.some((t: any) => t.id === taskId)) return p;
        changed = true;
        const updatedTasks = tasks.map((t: any) =>
          t.id === taskId ? { ...t, status, ...(additionalUpdates || {}) } : t
        );
        const completedCount = updatedTasks.filter((t: any) => t.status === 'done').length;
        const progress = updatedTasks.length > 0 ? Math.round((completedCount / updatedTasks.length) * 100) : 0;
        return { ...p, tasks: updatedTasks, progress };
      });
      if (changed) {
        sessionStorage.setItem('cached_projects_list', JSON.stringify(updatedProjects));
      }
    }
  } catch (e) {
    console.warn('Failed to update cached_projects_list for task:', e);
  }

  // 2. Update cached_crm_tasks
  try {
    const rawTasks = sessionStorage.getItem('cached_crm_tasks');
    if (rawTasks) {
      const tasks = JSON.parse(rawTasks);
      let changed = false;
      const updatedTasks = tasks.map((t: any) => {
        if (t.id === taskId) {
          changed = true;
          return { ...t, status, ...(additionalUpdates || {}) };
        }
        return t;
      });
      if (changed) {
        sessionStorage.setItem('cached_crm_tasks', JSON.stringify(updatedTasks));
      }
    }
  } catch (e) {
    console.warn('Failed to update cached_crm_tasks for task:', e);
  }
}

/**
 * Updates a project across ALL relevant sessionStorage caches:
 * - cached_projects_list
 * - cached_crm_projects
 */
export function syncProjectToSessionCaches(projectId: string, updates: Record<string, any>): void {
  if (typeof window === 'undefined') return;

  try {
    const rawProjects = sessionStorage.getItem('cached_projects_list');
    if (rawProjects) {
      const projects = JSON.parse(rawProjects);
      const updated = projects.map((p: any) => p.id === projectId ? { ...p, ...updates } : p);
      sessionStorage.setItem('cached_projects_list', JSON.stringify(updated));
    }
  } catch {}

  try {
    const rawCrmProjects = sessionStorage.getItem('cached_crm_projects');
    if (rawCrmProjects) {
      const projects = JSON.parse(rawCrmProjects);
      const updated = projects.map((p: any) => p.id === projectId ? { ...p, ...updates } : p);
      sessionStorage.setItem('cached_crm_projects', JSON.stringify(updated));
    }
  } catch {}
}

/**
 * Updates an invoice across ALL relevant sessionStorage caches:
 * - cached_crm_invoices
 * - cached_invoices_list
 */
export function syncInvoiceToSessionCaches(invoiceId: string, status: string, updates?: Record<string, any>): void {
  if (typeof window === 'undefined') return;

  try {
    const rawInvoices = sessionStorage.getItem('cached_crm_invoices');
    if (rawInvoices) {
      const invoices = JSON.parse(rawInvoices);
      const updated = invoices.map((inv: any) => inv.id === invoiceId ? { ...inv, status, ...(updates || {}) } : inv);
      sessionStorage.setItem('cached_crm_invoices', JSON.stringify(updated));
    }
  } catch {}

  try {
    const rawInvoices = sessionStorage.getItem('cached_invoices_list');
    if (rawInvoices) {
      const invoices = JSON.parse(rawInvoices);
      const updated = invoices.map((inv: any) => inv.id === invoiceId ? { ...inv, status, ...(updates || {}) } : inv);
      sessionStorage.setItem('cached_invoices_list', JSON.stringify(updated));
    }
  } catch {}
}

/**
 * Updates a client across ALL relevant sessionStorage caches:
 * - cached_crm_clients
 * - cached_projects_clients
 * - cached_leads_list
 */
export function syncClientToSessionCaches(clientId: string, updates: Record<string, any>): void {
  if (typeof window === 'undefined') return;

  try {
    const rawClients = sessionStorage.getItem('cached_crm_clients');
    if (rawClients) {
      const clients = JSON.parse(rawClients);
      const updated = clients.map((c: any) => c.id === clientId ? { ...c, ...updates } : c);
      sessionStorage.setItem('cached_crm_clients', JSON.stringify(updated));
    }
  } catch {}

  try {
    const rawClients = sessionStorage.getItem('cached_projects_clients');
    if (rawClients) {
      const clients = JSON.parse(rawClients);
      const updated = clients.map((c: any) => c.id === clientId ? { ...c, ...updates } : c);
      sessionStorage.setItem('cached_projects_clients', JSON.stringify(updated));
    }
  } catch {}
}

/**
 * Broadcast an event to other tabs, current window components, and update relevant session caches.
 */
export function emitSyncEvent(channelName: SyncChannel, payload: any): void {
  if (typeof window === 'undefined') return;

  // Auto-update session storage caches based on event type
  if (channelName === 'docspace_task_status' && payload?.taskId && payload?.status) {
    syncTaskToSessionCaches(payload.taskId, payload.status, payload.additionalUpdates);
  } else if (channelName === 'docspace_project_status' && payload?.projectId) {
    syncProjectToSessionCaches(payload.projectId, payload.updates || {});
  } else if (channelName === 'docspace_invoice_status' && payload?.invoiceId && payload?.status) {
    syncInvoiceToSessionCaches(payload.invoiceId, payload.status, payload.updates);
  } else if (channelName === 'docspace_client_status' && payload?.clientId) {
    syncClientToSessionCaches(payload.clientId, payload.updates || { status: payload.status });
  }

  // 1. Broadcast to other browser tabs / windows
  try {
    const bc = getBroadcastChannel(channelName);
    if (bc) {
      bc.postMessage(payload);
    }
  } catch (e) {
    console.warn(`Failed to broadcast on ${channelName}:`, e);
  }

  // 2. Dispatch local CustomEvent for components in the CURRENT tab / SPA context
  try {
    window.dispatchEvent(new CustomEvent(channelName, { detail: payload }));
  } catch (e) {
    console.warn(`Failed to dispatch local event on ${channelName}:`, e);
  }
}

/**
 * Subscribe to sync events from BOTH other tabs (BroadcastChannel) AND current window (CustomEvent).
 * Returns an unsubscribe cleanup function.
 */
export function subscribeSyncEvent<T = any>(
  channelName: SyncChannel,
  callback: (payload: T) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  // Handler for BroadcastChannel (other tabs)
  const bc = getBroadcastChannel(channelName);
  const handleBcMessage = (event: MessageEvent) => {
    if (event.data) {
      callback(event.data);
    }
  };
  if (bc) {
    bc.addEventListener('message', handleBcMessage);
  }

  // Handler for Window CustomEvent (same tab)
  const handleLocalEvent = (event: Event) => {
    const customEvt = event as CustomEvent<T>;
    if (customEvt.detail) {
      callback(customEvt.detail);
    }
  };
  window.addEventListener(channelName, handleLocalEvent);

  return () => {
    if (bc) {
      bc.removeEventListener('message', handleBcMessage);
    }
    window.removeEventListener(channelName, handleLocalEvent);
  };
}
