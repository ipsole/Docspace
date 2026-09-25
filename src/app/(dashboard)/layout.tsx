'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  LayoutDashboard, MessageSquare, FolderKanban, Target, Users2,
  FileText, FileSpreadsheet, Calendar, Settings, LogOut, Plus,
  Check, Loader2, Menu, PanelLeftClose, PanelLeftOpen,
  MoreVertical, Search, ReceiptText, UserCheck, Briefcase, Globe, Shield
} from 'lucide-react';
import CommandPalette from '@/components/CommandPalette';
import { ConfirmProvider, useConfirm } from '@/context/ConfirmContext';

interface NavGroup {
  title: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Collaboration',
    items: [
      { href: '/chats', label: 'Chats', icon: MessageSquare },
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/calendar', label: 'Calendar', icon: Calendar },
    ],
  },
  {
    title: 'CRM',
    items: [
      { href: '/leads', label: 'Leads', icon: Target },
      { href: '/clients', label: 'Clients', icon: Users2 },
      { href: '/invoices', label: 'Invoices', icon: ReceiptText },
      { href: '/white-label', label: 'White Label', icon: Globe },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/billing', label: 'Billing', icon: FileSpreadsheet },
      { href: '/storage', label: 'Storage', icon: FileText },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspace, createWorkspace, fetchWorkspaces, getTabAccess, currentMember } = useWorkspace();
  const confirm = useConfirm();

  const isOwner = !!(activeWorkspace && user && (activeWorkspace.ownerId === user.id || currentMember?.role === 'owner'));
  const isManager = currentMember?.role === 'manager';
  const isTeamMember = currentMember?.role === 'team' || currentMember?.role === 'member';

  const designationLabel = isOwner
    ? 'Admin'
    : isManager
    ? 'Manager'
    : isTeamMember
    ? 'Team Member'
    : 'Member';

  const currentSection = pathname ? pathname.split('/')[1]?.split('?')[0] : '';
  const isRestricted = !!currentSection && currentSection !== 'dashboard' && currentSection !== 'settings' && getTabAccess(currentSection) === 'none';

  const filteredNavGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => {
      const key = item.href.replace(/^\//, '').split('?')[0];
      if (key === 'dashboard') return true;
      return getTabAccess(key) !== 'none';
    })
  })).filter(group => group.items.length > 0);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [creating, setCreating] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // --- CHAT UNREAD NOTIFICATIONS & CONNECTION WARMUP ---
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  const warmChatConnection = () => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    const lastWarmup = Number(sessionStorage.getItem('last_chat_warmup') || '0');
    if (now - lastWarmup < 45000) return; // Prevent spamming warmup within 45s
    sessionStorage.setItem('last_chat_warmup', String(now));
    fetch('/api/chat/warmup', { method: 'POST', keepalive: true }).catch(() => {});
  };

  useEffect(() => {
    if (!activeWorkspace?.id || !user?.id) return;
    const wsId = activeWorkspace.id;
    const userId = user.id;

    // Same-page: chats page dispatches CustomEvent when unread count changes
    const handleUnreadEvent = (e: any) => {
      if (!e.detail || !e.detail.workspaceId || e.detail.workspaceId === wsId) {
        setUnreadChatCount(Number(e.detail?.count) || 0);
      }
    };
    window.addEventListener('docspace_unread_chat_count', handleUnreadEvent);

    // Cross-tab: chats page broadcasts count via BroadcastChannel
    let bcUnread: BroadcastChannel | null = null;
    try {
      bcUnread = new BroadcastChannel('docspace_chat_unread');
      bcUnread.onmessage = (event) => {
        const { count, workspaceId } = event.data || {};
        if (workspaceId && workspaceId !== wsId) return;
        setUnreadChatCount(Number(count) || 0);
        try { localStorage.setItem(`docspace_unread_chat_count_${wsId}`, String(count)); } catch {}
      };
    } catch {}

    // Initial cache hydrate
    try {
      const cached = localStorage.getItem(`docspace_unread_chat_count_${wsId}`);
      if (cached !== null) {
        setUnreadChatCount(Number(cached) || 0);
      }
    } catch {}

    // One-shot check on mount (covers case where user lands here without ever opening chats)
    const checkUnread = async () => {
      try {
        const res = await fetch(`/api/chat?workspaceId=${wsId}`);
        if (!res.ok) return;
        const convos: any[] = await res.json();
        let count = 0;
        for (const c of convos) {
          const lastMsg = c.lastMessage;
          if (!lastMsg || !lastMsg.createdAt) continue;
          if (lastMsg.senderId && lastMsg.senderId === userId) continue;
          const lastRead = localStorage.getItem(`chat_last_read_${userId}_${c.id}`);
          if (!lastRead || new Date(lastMsg.createdAt).getTime() > new Date(lastRead).getTime()) {
            count++;
          }
        }
        setUnreadChatCount(count);
        try { localStorage.setItem(`docspace_unread_chat_count_${wsId}`, String(count)); } catch {}
      } catch {}
    };

    checkUnread();
    // Fallback poll every 3 minutes (safety net only — BroadcastChannel handles real-time)
    const interval = setInterval(checkUnread, 180000);
    return () => {
      window.removeEventListener('docspace_unread_chat_count', handleUnreadEvent);
      clearInterval(interval);
      try { bcUnread?.close(); } catch {}
    };
  }, [activeWorkspace?.id, user?.id]);

  // Restore scroll position when tab/pathname changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedScroll = sessionStorage.getItem(`scroll_pos_${pathname}`);
      if (savedScroll && mainScrollRef.current) {
        mainScrollRef.current.scrollTop = Number(savedScroll);
      } else if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = 0;
      }
    } catch {}
  }, [pathname]);

  const handleMainScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(`scroll_pos_${pathname}`, String(e.currentTarget.scrollTop));
    } catch {}
  };

  // Global Command+K / Ctrl+K listener for quick search
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  // Global escape key handler
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
        setShowWorkspacePicker(false);
        setShowNewWorkspaceModal(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(newWsName.trim());
      setNewWsName('');
      setShowNewWorkspaceModal(false);
      fetchWorkspaces();
    } catch {
      alert('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of your account?',
      confirmText: 'Sign Out',
      variant: 'primary',
    });
    if (ok) {
      await logout();
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#f4f5f7] text-[#111827] p-3 sm:p-5 gap-4 sm:gap-5 overflow-hidden font-sans">
      {/* =========================================================================
          FLOATING WHITE SIDEBAR (Styling from reference: Expanded vs Collapsed)
          ========================================================================= */}
      <aside
        className={`
          fixed inset-y-4 left-4 z-[100] bg-white rounded-3xl border border-gray-200/80
          shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex flex-col justify-between
          transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-[74px] p-3' : 'w-72 p-5'}
          ${sidebarMobileOpen ? 'translate-x-0' : '-translate-x-[120%]'}
          lg:relative lg:translate-x-0 lg:inset-y-0 lg:left-0 lg:z-auto
        `}
      >
        {/* --- TOP BRAND / WORKSPACE HEADER --- */}
        <div className="flex-1 flex flex-col min-h-0 overflow-visible">
          <div className="mb-4 pt-1.5 overflow-visible">
            {!isCollapsed ? (
              <div
                onClick={() => setShowWorkspacePicker(!showWorkspacePicker)}
                className="min-w-0 cursor-pointer select-none px-1 overflow-visible"
              >
                <h1 className="text-[30px] font-dearllane font-normal text-gray-950 tracking-normal leading-[1.3] pt-2 pb-0.5 overflow-visible select-none">
                  Docspace
                </h1>
              </div>
            ) : (
              <div
                onClick={() => setIsCollapsed(false)}
                className="h-10 w-10 mx-auto rounded-xl hover:bg-gray-100 flex items-center justify-center cursor-pointer transition-colors"
                title="Expand sidebar"
              >
                <span className="text-2xl font-dearllane font-normal text-gray-950 pt-1 leading-normal">D</span>
              </div>
            )}
          </div>

          {/* Workspace Switcher Dropdown */}
          {!isCollapsed && showWorkspacePicker && (
            <div className="mb-4 p-2 bg-gray-50/90 border border-gray-200/80 rounded-2xl space-y-1 max-h-48 overflow-y-auto animate-in fade-in duration-150">
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Workspaces</p>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                  {designationLabel}
                </span>
              </div>
              {workspaces.map(ws => {
                const displayName = (!isOwner && ws.name.toLowerCase() === 'admin') ? 'Docspace' : ws.name;
                return (
                  <button
                    key={ws.id}
                    onClick={() => { setActiveWorkspace(ws); setShowWorkspacePicker(false); }}
                    className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 text-xs rounded-xl transition-all ${
                      activeWorkspace?.id === ws.id
                        ? 'bg-white font-bold text-gray-900 shadow-xs'
                        : 'hover:bg-white/60 text-gray-600'
                    }`}
                  >
                    <span className="truncate flex-1 text-left">{displayName}</span>
                    {activeWorkspace?.id === ws.id && <Check className="h-3.5 w-3.5 text-gray-900" />}
                  </button>
                );
              })}
              {isOwner && (
                <button
                  onClick={() => { setShowNewWorkspaceModal(true); setShowWorkspacePicker(false); }}
                  className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-100 rounded-xl transition-colors mt-1 border-t border-gray-200/60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Workspace
                </button>
              )}
            </div>
          )}

          {/* --- CATEGORIZED NAVIGATION ITEMS WITH SECTION HEADERS --- */}
          <nav className="flex-1 overflow-y-auto pr-0.5 no-scrollbar space-y-2.5">
            {filteredNavGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-0.5">
                {/* Section Header Text (shown in expanded mode) */}
                {!isCollapsed && (
                  <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase px-3 pt-2 pb-0.5 select-none">
                    {group.title}
                  </p>
                )}

                {/* Collapsed Mode subtle spacing */}
                {isCollapsed && gIdx > 0 && (
                  <div className="h-1.5" />
                )}

                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const itemPath = item.href.split('?')[0];
                    const itemQuery = item.href.includes('?') ? item.href.split('?')[1] : null;
                    const isActive = itemQuery
                      ? (pathname === itemPath && (typeof window !== 'undefined' && window.location.search.includes(itemQuery)))
                      : (pathname === itemPath || (itemPath !== '/' && pathname?.startsWith(itemPath + '/')));

                    const isChat = item.href === '/chats';
                    const showBadge = isChat && unreadChatCount > 0;

                    if (isCollapsed) {
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onMouseEnter={() => { if (isChat) warmChatConnection(); }}
                          onTouchStart={() => { if (isChat) warmChatConnection(); }}
                          onClick={() => {
                            setSidebarMobileOpen(false);
                            if (isChat) warmChatConnection();
                          }}
                          className="w-full flex justify-center py-0.5"
                        >
                          <div
                            className={`
                              relative flex items-center justify-center h-9 w-9 rounded-lg transition-colors
                              ${isActive
                                ? 'bg-gray-100 text-gray-900 font-semibold shadow-2xs'
                                : 'text-gray-400 hover:text-gray-900 hover:bg-gray-50'
                              }
                            `}
                            title={item.label}
                          >
                            <Icon className="h-4 w-4 stroke-[1.8]" />
                            {showBadge ? (
                              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white ring-2 ring-white">
                                {unreadChatCount > 99 ? '99+' : unreadChatCount}
                              </span>
                            ) : (
                              isActive && (
                                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-gray-900 ring-2 ring-white" />
                              )
                            )}
                          </div>
                        </Link>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onMouseEnter={() => { if (isChat) warmChatConnection(); }}
                        onTouchStart={() => { if (isChat) warmChatConnection(); }}
                        onClick={() => {
                          setSidebarMobileOpen(false);
                          if (isChat) warmChatConnection();
                        }}
                        className={`
                          flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                          ${isActive
                            ? 'bg-gray-100 text-gray-950 font-semibold'
                            : 'text-gray-600 hover:text-gray-950 hover:bg-gray-50'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`h-4 w-4 stroke-[1.8] shrink-0 ${isActive ? 'text-gray-950' : 'text-gray-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {showBadge && (
                          <span className="ml-auto shrink-0 flex h-4 min-w-4 px-1.5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow-2xs">
                            {unreadChatCount > 99 ? '99+' : unreadChatCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* --- BOTTOM SECTION: SEARCH & RIGHT-ALIGNED PROFILE ICON ONLY --- */}
        <div className="shrink-0 pt-3 border-t border-gray-100/80 mt-2">
          {!isCollapsed ? (
            <div className="flex items-center gap-2">
              {/* Ultra-Clean Quick Search Bar */}
              <button
                type="button"
                onClick={() => setShowCommandPalette(true)}
                className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50/80 hover:bg-gray-100/90 border border-gray-200/70 text-xs transition-all cursor-pointer group text-left min-w-0"
                title="Quick search (⌘K)"
              >
                <div className="flex items-center gap-2 text-gray-400 group-hover:text-gray-700 transition-colors min-w-0 truncate">
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium text-xs text-gray-400 group-hover:text-gray-700 truncate">Search...</span>
                </div>
                <kbd className="text-[10px] font-mono text-gray-400 bg-white border border-gray-200/80 rounded px-1.5 py-0.5 shadow-2xs group-hover:border-gray-300 shrink-0">
                  ⌘K
                </kbd>
              </button>

              {/* Right-Aligned Profile Icon Only */}
              <div className="relative shrink-0" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="h-8.5 w-8.5 rounded-full ring-1 ring-gray-200 overflow-hidden flex items-center justify-center bg-gray-100 text-gray-700 font-bold text-xs hover:ring-gray-400 transition-all cursor-pointer shrink-0"
                  title="Account & Settings"
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username} className="h-full w-full object-cover" />
                  ) : (
                    user?.displayName?.[0]?.toUpperCase() ?? 'U'
                  )}
                </button>

                {/* User Popover Menu (Opens upwards from icon) */}
                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-transparent cursor-default"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute right-0 bottom-full mb-2 z-50 bg-white border border-gray-200/90 rounded-2xl shadow-xl p-1.5 w-56 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <p className="text-xs font-bold text-gray-900 truncate">{user?.displayName || user?.username}</p>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border shrink-0 ${
                            isOwner
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : isManager
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}>
                            {designationLabel}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{user?.email || 'Logged in'}</p>
                      </div>

                      <Link
                        href="/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5 text-gray-400" />
                        Settings
                      </Link>

                      {isOwner && (
                        <button
                          onClick={() => { setShowNewWorkspaceModal(true); setShowUserMenu(false); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5 text-gray-400" />
                          New Workspace
                        </button>
                      )}

                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:text-black rounded-xl transition-colors border-t border-gray-100 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5 text-gray-500" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Collapsed Mode Bottom Actions */
            <div className="flex flex-col items-center space-y-2">
              <button
                type="button"
                onClick={() => setShowCommandPalette(true)}
                className="h-9 w-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
                title="Search (⌘K)"
              >
                <Search className="h-4 w-4" />
              </button>

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="h-8.5 w-8.5 rounded-full ring-1 ring-gray-200 overflow-hidden flex items-center justify-center bg-gray-100 text-gray-700 font-bold text-xs hover:ring-gray-400 transition-all cursor-pointer"
                  title={user?.displayName || user?.username || 'User'}
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username} className="h-full w-full object-cover" />
                  ) : (
                    user?.displayName?.[0]?.toUpperCase() ?? 'U'
                  )}
                </button>

                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-transparent cursor-default"
                      onClick={() => setShowUserMenu(false)}
                    />
                    <div className="absolute left-full bottom-0 ml-2 z-50 bg-white border border-gray-200/90 rounded-2xl shadow-xl p-1.5 w-56 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <p className="text-xs font-bold text-gray-900 truncate">{user?.displayName || user?.username}</p>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border shrink-0 ${
                            isOwner
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : isManager
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}>
                            {designationLabel}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{user?.email || 'Logged in'}</p>
                      </div>

                      <Link
                        href="/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                      >
                        <Settings className="h-3.5 w-3.5 text-gray-400" />
                        Settings
                      </Link>

                      {isOwner && (
                        <button
                          onClick={() => { setShowNewWorkspaceModal(true); setShowUserMenu(false); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5 text-gray-400" />
                          New Workspace
                        </button>
                      )}

                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:text-black rounded-xl transition-colors border-t border-gray-100 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5 text-gray-500" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Backdrop */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarMobileOpen(false)}
        />
      )}

      {/* =========================================================================
          MAIN FLOATING CONTENT CONTAINER (MAXIMUM VIEWPORT HEIGHT FOR DATA)
          ========================================================================= */}
      <main className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden relative p-3 sm:p-6">
        {/* Mobile Top Navigation Header - Corner Menu Button Only */}
        <div className="lg:hidden shrink-0 flex items-center mb-2">
          <button
            onClick={() => setSidebarMobileOpen(true)}
            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200/80 text-gray-700 shadow-2xs transition-colors shrink-0"
            title="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        {/* Viewport for Page Children */}
        <div
          ref={mainScrollRef}
          onScroll={handleMainScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden pr-0.5 no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {isRestricted ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 max-w-md mx-auto">
              <div className="h-16 w-16 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400 shadow-xs">
                <Shield className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Restricted</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                You do not have permission to access the <span className="font-bold text-gray-700 dark:text-gray-200 capitalize">{currentSection.replace('-', ' ')}</span> module in this workspace. Contact your workspace administrator to request access.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                Return to Dashboard
              </Link>
            </div>
          ) : (
            children
          )}
        </div>
      </main>

      {/* New Workspace Modal */}
      {showNewWorkspaceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-xs overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewWorkspaceModal(false); }}
        >
          <div className="w-full max-w-sm max-h-[88vh] bg-white rounded-3xl border border-gray-200/90 shadow-2xl p-6 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-gray-900 mb-1">Create New Workspace</h3>
            <p className="text-xs text-gray-500 mb-4">Set up a space for your team or personal projects.</p>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Design Studio"
                value={newWsName}
                onChange={e => setNewWsName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-100 transition-all"
              />
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewWorkspaceModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-500 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Command Palette */}
      <CommandPalette isOpen={showCommandPalette} onClose={() => setShowCommandPalette(false)} />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </ConfirmProvider>
  );
}
