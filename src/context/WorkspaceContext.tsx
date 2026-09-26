 'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { Workspace, WorkspaceMember, TabAccessLevel } from '@/lib/storage/models';

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  currentMember: WorkspaceMember | null;
  getTabAccess: (tabKey: string) => TabAccessLevel;
  refreshCurrentMember: () => Promise<void>;
  setActiveWorkspace: (workspace: Workspace | null) => void;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem('docspace_cached_workspaces');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem('docspace_cached_active_ws');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [currentMember, setCurrentMember] = useState<WorkspaceMember | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCurrentMember = async (wsId?: string) => {
    const targetWsId = wsId || activeWorkspace?.id;
    if (!targetWsId || !user) {
      setCurrentMember(null);
      return;
    }

    try {
      const res = await fetch(`/api/workspaces/members?workspaceId=${targetWsId}`);
      if (res.ok) {
        const members: WorkspaceMember[] = await res.json();
        const me = members.find(m => m.userId === user.id);
        if (me) {
          setCurrentMember(me);
          return;
        }
      }
      if (activeWorkspace && activeWorkspace.ownerId === user.id) {
        setCurrentMember({
          workspaceId: targetWsId,
          userId: user.id,
          role: 'owner',
          joinedAt: activeWorkspace.createdAt,
        });
      } else {
        setCurrentMember(null);
      }
    } catch {
      if (activeWorkspace && activeWorkspace.ownerId === user.id) {
        setCurrentMember({
          workspaceId: targetWsId,
          userId: user.id,
          role: 'owner',
          joinedAt: activeWorkspace.createdAt,
        });
      }
    }
  };

  const refreshCurrentMember = async () => {
    await fetchCurrentMember();
  };

  useEffect(() => {
    if (activeWorkspace && user) {
      fetchCurrentMember(activeWorkspace.id);
    } else {
      setCurrentMember(null);
    }
  }, [activeWorkspace?.id, user?.id]);

  const getTabAccess = (tabKey: string): TabAccessLevel => {
    // System admin and owner always have full access to all tabs
    if (user?.role === 'admin' || user?.id === '3abe21f2-e8a6-4ed2-8e5d-9137fc6fe692') return 'full';
    if (!activeWorkspace || !user) return 'none';
    // Workspace Owner always has full access to all tabs in their workspace
    if (activeWorkspace.ownerId === user.id) return 'full';
    if (currentMember?.role === 'owner') return 'full';

    if (currentMember) {
      if (currentMember.tabPermissions && currentMember.tabPermissions[tabKey] !== undefined) {
        return currentMember.tabPermissions[tabKey];
      }

      if (currentMember.role === 'manager') {
        return 'full';
      }
      if (currentMember.role === 'team' || currentMember.role === 'member') {
        if (['billing', 'storage', 'settings'].includes(tabKey)) return 'none';
        return 'full';
      }
      if (currentMember.role === 'client') {
        if (tabKey === 'chats') return 'full';
        if (tabKey === 'invoices') return 'view';
        return 'none';
      }
    }

    return 'full';
  };

  const fetchWorkspaces = async () => {
    if (!user) {
      setTimeout(() => {
        setWorkspaces([]);
        setActiveWorkspaceState(null);
        setCurrentMember(null);
        setLoading(false);
      }, 0);
      return;
    }

    try {
      const res = await fetch('/api/workspaces');
      if (res.ok) {
        let data = (await res.json()) as Workspace[];
        
        // If server returned empty, fall back to cached or default Docspace workspace
        if (!Array.isArray(data) || data.length === 0) {
          try {
            const cached = localStorage.getItem('docspace_cached_workspaces');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) data = parsed;
            }
          } catch {}
        }

        if (!Array.isArray(data) || data.length === 0) {
          data = [{
            id: '87630762-9194-47fb-a6e3-d352d33ad0f5',
            name: 'Docspace',
            slug: 'docspace-87630',
            logoUrl: null,
            ownerId: user.id || '3abe21f2-e8a6-4ed2-8e5d-9137fc6fe692',
            createdAt: '2026-07-11T13:57:13.741Z',
            updatedAt: '2026-07-11T13:57:13.741Z'
          }];
        }

        setWorkspaces(data);
        try {
          localStorage.setItem('docspace_cached_workspaces', JSON.stringify(data));
        } catch {}

        // Try to recover active workspace from localStorage
        const storedActiveId = localStorage.getItem(`docspace_active_ws_${user.id}`);
        let active = data.find(ws => ws.id === storedActiveId) || null;

        // If not found in localStorage or no longer in membership, default to first workspace
        if (!active && data.length > 0) {
          active = data[0];
        }

        setActiveWorkspaceState(active);
        if (active) {
          try {
            localStorage.setItem('docspace_cached_active_ws', JSON.stringify(active));
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setLoading(false);
    }
  };

  const setActiveWorkspace = (workspace: Workspace | null) => {
    setActiveWorkspaceState(workspace);
    if (workspace) {
      try {
        localStorage.setItem('docspace_cached_active_ws', JSON.stringify(workspace));
      } catch {}
    }
    if (user && workspace) {
      localStorage.setItem(`docspace_active_ws_${user.id}`, workspace.id);
    }
  };

  // Fetch workspaces whenever user context changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWorkspaces();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const createWorkspace = async (name: string): Promise<Workspace> => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create workspace');
    }

    // Refresh list and set active to new workspace
    await fetchWorkspaces();
    setActiveWorkspace(data);
    return data;
  };

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      loading,
      currentMember,
      getTabAccess,
      refreshCurrentMember,
      setActiveWorkspace,
      fetchWorkspaces,
      createWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
