'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { db } from '@/lib/firebase/client';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { WorkspaceSyncState } from '@/lib/services/syncState';

interface WorkspaceCacheContextType {
  invoices: any[];
  clients: any[];
  projects: any[];
  invoicesLoading: boolean;
  clientsLoading: boolean;
  projectsLoading: boolean;
  lastSyncedAt: number;
  refreshInvoices: () => Promise<void>;
  refreshClients: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshAll: () => Promise<void>;
  mutateInvoices: (updater: (prev: any[]) => any[]) => void;
  mutateClients: (updater: (prev: any[]) => any[]) => void;
  mutateProjects: (updater: (prev: any[]) => any[]) => void;
}

const WorkspaceCacheContext = createContext<WorkspaceCacheContextType | undefined>(undefined);

export function WorkspaceCacheProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace();
  const wsId = activeWorkspace?.id;

  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(Date.now());

  // Track timestamps of when each entity was last fetched
  const entityTimestampsRef = useRef<{
    invoices: number;
    clients: number;
    projects: number;
  }>({ invoices: 0, clients: 0, projects: 0 });

  // In-flight fetch deduplication to prevent double-fetching
  const inFlightRef = useRef<{
    invoices?: Promise<any>;
    clients?: Promise<any>;
    projects?: Promise<any>;
  }>({});

  // Broadcast channel for instantaneous cross-tab synchronization
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Setup broadcast channel
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const bc = new BroadcastChannel('docspace_workspace_cache');
      bc.onmessage = (event) => {
        const { type, workspaceId, data } = event.data || {};
        if (workspaceId !== wsId) return;

        if (type === 'INVOICES_UPDATED' && Array.isArray(data)) {
          setInvoices(data);
          try { sessionStorage.setItem(`cached_invoices_${wsId}`, JSON.stringify(data)); } catch {}
        } else if (type === 'CLIENTS_UPDATED' && Array.isArray(data)) {
          setClients(data);
          try { sessionStorage.setItem(`cached_clients_${wsId}`, JSON.stringify(data)); } catch {}
        } else if (type === 'PROJECTS_UPDATED' && Array.isArray(data)) {
          setProjects(data);
          try { sessionStorage.setItem(`cached_projects_${wsId}`, JSON.stringify(data)); } catch {}
        }
      };
      broadcastChannelRef.current = bc;
      return () => {
        bc.close();
      };
    } catch {}
  }, [wsId]);

  // Fetch Invoices
  const fetchInvoices = useCallback(async (silent = false) => {
    if (!wsId) return;
    if (inFlightRef.current.invoices) return inFlightRef.current.invoices;

    if (!silent && invoices.length === 0) setInvoicesLoading(true);

    const task = (async () => {
      try {
        const res = await fetch(`/api/crm/invoices?workspaceId=${wsId}`);
        if (res.ok) {
          const data = await res.json();
          setInvoices(data);
          entityTimestampsRef.current.invoices = Date.now();
          setLastSyncedAt(Date.now());
          try { sessionStorage.setItem(`cached_invoices_${wsId}`, JSON.stringify(data)); } catch {}
          broadcastChannelRef.current?.postMessage({ type: 'INVOICES_UPDATED', workspaceId: wsId, data });
        }
      } catch (err) {
        console.error('[Cache] Failed to fetch invoices:', err);
      } finally {
        setInvoicesLoading(false);
        delete inFlightRef.current.invoices;
      }
    })();

    inFlightRef.current.invoices = task;
    return task;
  }, [wsId, invoices.length]);

  // Fetch Clients
  const fetchClients = useCallback(async (silent = false) => {
    if (!wsId) return;
    if (inFlightRef.current.clients) return inFlightRef.current.clients;

    if (!silent && clients.length === 0) setClientsLoading(true);

    const task = (async () => {
      try {
        const res = await fetch(`/api/crm/clients?workspaceId=${wsId}`);
        if (res.ok) {
          const data = await res.json();
          setClients(data);
          entityTimestampsRef.current.clients = Date.now();
          setLastSyncedAt(Date.now());
          try { sessionStorage.setItem(`cached_clients_${wsId}`, JSON.stringify(data)); } catch {}
          broadcastChannelRef.current?.postMessage({ type: 'CLIENTS_UPDATED', workspaceId: wsId, data });
        }
      } catch (err) {
        console.error('[Cache] Failed to fetch clients:', err);
      } finally {
        setClientsLoading(false);
        delete inFlightRef.current.clients;
      }
    })();

    inFlightRef.current.clients = task;
    return task;
  }, [wsId, clients.length]);

  // Fetch Projects
  const fetchProjects = useCallback(async (silent = false) => {
    if (!wsId) return;
    if (inFlightRef.current.projects) return inFlightRef.current.projects;

    if (!silent && projects.length === 0) setProjectsLoading(true);

    const task = (async () => {
      try {
        const res = await fetch(`/api/projects?workspaceId=${wsId}`);
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
          entityTimestampsRef.current.projects = Date.now();
          setLastSyncedAt(Date.now());
          try { sessionStorage.setItem(`cached_projects_${wsId}`, JSON.stringify(data)); } catch {}
          broadcastChannelRef.current?.postMessage({ type: 'PROJECTS_UPDATED', workspaceId: wsId, data });
        }
      } catch (err) {
        console.error('[Cache] Failed to fetch projects:', err);
      } finally {
        setProjectsLoading(false);
        delete inFlightRef.current.projects;
      }
    })();

    inFlightRef.current.projects = task;
    return task;
  }, [wsId, projects.length]);

  // Manual & Action Refreshers
  const refreshInvoices = useCallback(async () => { await fetchInvoices(false); }, [fetchInvoices]);
  const refreshClients = useCallback(async () => { await fetchClients(false); }, [fetchClients]);
  const refreshProjects = useCallback(async () => { await fetchProjects(false); }, [fetchProjects]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchInvoices(false), fetchClients(false), fetchProjects(false)]);
  }, [fetchInvoices, fetchClients, fetchProjects]);

  // Local optimistic mutators
  const mutateInvoices = useCallback((updater: (prev: any[]) => any[]) => {
    setInvoices(prev => {
      const next = updater(prev);
      try { sessionStorage.setItem(`cached_invoices_${wsId}`, JSON.stringify(next)); } catch {}
      broadcastChannelRef.current?.postMessage({ type: 'INVOICES_UPDATED', workspaceId: wsId, data: next });
      return next;
    });
  }, [wsId]);

  const mutateClients = useCallback((updater: (prev: any[]) => any[]) => {
    setClients(prev => {
      const next = updater(prev);
      try { sessionStorage.setItem(`cached_clients_${wsId}`, JSON.stringify(next)); } catch {}
      broadcastChannelRef.current?.postMessage({ type: 'CLIENTS_UPDATED', workspaceId: wsId, data: next });
      return next;
    });
  }, [wsId]);

  const mutateProjects = useCallback((updater: (prev: any[]) => any[]) => {
    setProjects(prev => {
      const next = updater(prev);
      try { sessionStorage.setItem(`cached_projects_${wsId}`, JSON.stringify(next)); } catch {}
      broadcastChannelRef.current?.postMessage({ type: 'PROJECTS_UPDATED', workspaceId: wsId, data: next });
      return next;
    });
  }, [wsId]);

  // Hydrate from sessionStorage immediately on activeWorkspace change (0ms instant load)
  useEffect(() => {
    if (!wsId || typeof window === 'undefined') {
      setInvoices([]);
      setClients([]);
      setProjects([]);
      return;
    }

    let hasInvoices = false;
    let hasClients = false;
    let hasProjects = false;

    try {
      const cInvoices = sessionStorage.getItem(`cached_invoices_${wsId}`);
      if (cInvoices) {
        const parsed = JSON.parse(cInvoices);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setInvoices(parsed);
          hasInvoices = true;
        }
      }

      const cClients = sessionStorage.getItem(`cached_clients_${wsId}`);
      if (cClients) {
        const parsed = JSON.parse(cClients);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClients(parsed);
          hasClients = true;
        }
      }

      const cProjects = sessionStorage.getItem(`cached_projects_${wsId}`);
      if (cProjects) {
        const parsed = JSON.parse(cProjects);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProjects(parsed);
          hasProjects = true;
        }
      }
    } catch {}

    // Initial load: fetch if cache was empty or invalid
    if (!hasInvoices) fetchInvoices(false);
    if (!hasClients) fetchClients(false);
    if (!hasProjects) fetchProjects(false);
  }, [wsId]);

  // Real-Time onSnapshot Push-to-Invalidate Listener
  useEffect(() => {
    if (!wsId || typeof window === 'undefined') return;

    let unsubscribe: Unsubscribe | null = null;

    try {
      const syncDocRef = doc(db, 'sync_state', `sync_${wsId}`);
      unsubscribe = onSnapshot(syncDocRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as WorkspaceSyncState;

        // Check invoices
        if (data.invoicesUpdatedAt && data.invoicesUpdatedAt > entityTimestampsRef.current.invoices) {
          fetchInvoices(true);
        }

        // Check clients
        if (data.clientsUpdatedAt && data.clientsUpdatedAt > entityTimestampsRef.current.clients) {
          fetchClients(true);
        }

        // Check projects
        if (data.projectsUpdatedAt && data.projectsUpdatedAt > entityTimestampsRef.current.projects) {
          fetchProjects(true);
        }
      }, (err) => {
        console.warn('[Cache] Sync state listener error:', err.message);
      });
    } catch (err: any) {
      console.warn('[Cache] Could not attach sync state listener:', err.message);
    }

    // Safety net: check sync timestamp on tab focus (e.g. laptop wake from sleep)
    const handleFocus = async () => {
      try {
        const res = await fetch(`/api/workspaces/sync?workspaceId=${wsId}`);
        if (!res.ok) return;
        const syncState: WorkspaceSyncState = await res.json();

        if (syncState.invoicesUpdatedAt && syncState.invoicesUpdatedAt > entityTimestampsRef.current.invoices) {
          fetchInvoices(true);
        }
        if (syncState.clientsUpdatedAt && syncState.clientsUpdatedAt > entityTimestampsRef.current.clients) {
          fetchClients(true);
        }
        if (syncState.projectsUpdatedAt && syncState.projectsUpdatedAt > entityTimestampsRef.current.projects) {
          fetchProjects(true);
        }
      } catch {}
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, [wsId, fetchInvoices, fetchClients, fetchProjects]);

  return (
    <WorkspaceCacheContext.Provider
      value={{
        invoices,
        clients,
        projects,
        invoicesLoading,
        clientsLoading,
        projectsLoading,
        lastSyncedAt,
        refreshInvoices,
        refreshClients,
        refreshProjects,
        refreshAll,
        mutateInvoices,
        mutateClients,
        mutateProjects,
      }}
    >
      {children}
    </WorkspaceCacheContext.Provider>
  );
}

export function useWorkspaceCache() {
  const context = useContext(WorkspaceCacheContext);
  if (!context) {
    throw new Error('useWorkspaceCache must be used within a WorkspaceCacheProvider');
  }
  return context;
}
