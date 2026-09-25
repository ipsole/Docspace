'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import Link from 'next/link';
import {
  FolderKanban, MessageSquare, Calendar, FileSpreadsheet,
  Users2, ArrowUpRight, CheckCircle2, Clock, Plus,
  AlertCircle, ChevronRight, Loader2, FileText, CheckSquare,
  Sparkles, ReceiptText
} from 'lucide-react';
import SkeletonScreen from '@/components/SkeletonScreen';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';
  progress: number;
  tasks?: any[];
  createdAt: string;
}

interface Conversation {
  id: string;
  name?: string;
  isChannel: boolean;
  isGroup?: boolean;
  lastMessage?: { content: string; createdAt: string } | null;
  updatedAt?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  startDateTime?: string;
  date?: string;
  startTime?: string;
  type?: string;
  location?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName?: string;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  dueDate?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientsCount, setClientsCount] = useState(0);

  useEffect(() => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const [projRes, chatRes, invRes, calRes, clientRes] = await Promise.all([
          fetch(`/api/projects?workspaceId=${activeWorkspace.id}`),
          fetch(`/api/chat?workspaceId=${activeWorkspace.id}`),
          fetch(`/api/crm/invoices?workspaceId=${activeWorkspace.id}`),
          fetch(`/api/calendar?workspaceId=${activeWorkspace.id}`),
          fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`)
        ]);

        const [projData, chatData, invData, calData, clientData] = await Promise.all([
          projRes.ok ? projRes.json() : [],
          chatRes.ok ? chatRes.json() : [],
          invRes.ok ? invRes.json() : [],
          calRes.ok ? calRes.json() : [],
          clientRes.ok ? clientRes.json() : []
        ]);

        setProjects(Array.isArray(projData) ? projData : []);
        setChats(Array.isArray(chatData) ? chatData : []);
        setInvoices(Array.isArray(invData) ? invData : []);
        setEvents(Array.isArray(calData) ? calData : []);
        setClientsCount(Array.isArray(clientData) ? clientData.length : 0);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [activeWorkspace]);

  if (loading && projects.length === 0 && invoices.length === 0) {
    return <SkeletonScreen />;
  }

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-sm bg-white rounded-3xl border border-gray-200 p-8 shadow-xs">
          <div className="h-12 w-12 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto mb-4 text-gray-500">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-bold text-gray-900 mb-1">No Workspace Selected</h2>
          <p className="text-xs text-gray-500">Select or create a workspace from the sidebar to view your dashboard.</p>
        </div>
      </div>
    );
  }

  // Derived metrics
  const activeProjectsCount = projects.filter(p => p.status === 'active' || p.status === 'planning').length;
  const completedProjectsCount = projects.filter(p => p.status === 'completed').length;
  const totalRevenue = invoices
    .filter(i => i.status === 'paid')
    .reduce((acc, curr) => acc + (curr.total || 0), 0);
  const pendingInvoicesCount = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* 1. WELCOME HEADER BANNER (Clean, Minimal, No Clutter) */}
      <div className="bg-gray-50/60 border border-gray-200/80 rounded-2xl p-5 sm:p-7">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
          Welcome back, {user?.displayName || user?.username || 'User'}
        </h1>
        <p className="text-sm sm:text-base text-gray-500 mt-1.5">
          Workspace overview and live activity for <span className="font-bold text-gray-800">{activeWorkspace.name}</span>.
        </p>
      </div>

      {/* 2. SEAMLESS TOP KEY METRICS (Monochromatic Black & White Theme, 2 per row on mobile) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Projects Metric */}
        <Link
          href="/projects"
          className="group bg-white rounded-xl sm:rounded-2xl border border-gray-200/80 p-4 sm:p-5 hover:border-gray-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-3 sm:space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center">
              <FolderKanban className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <ArrowUpRight className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 truncate">Active Projects</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              {loading ? '—' : activeProjectsCount}
              <span className="text-xs sm:text-sm font-normal text-gray-400 ml-1.5">/ {projects.length} total</span>
            </p>
          </div>
        </Link>

        {/* Chats Metric */}
        <Link
          href="/chats"
          className="group bg-white rounded-xl sm:rounded-2xl border border-gray-200/80 p-4 sm:p-5 hover:border-gray-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-3 sm:space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center">
              <MessageSquare className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <ArrowUpRight className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 truncate">Channels & Chats</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              {loading ? '—' : chats.length}
              <span className="text-xs sm:text-sm font-normal text-gray-400 ml-1.5">convs</span>
            </p>
          </div>
        </Link>

        {/* Calendar Metric */}
        <Link
          href="/calendar"
          className="group bg-white rounded-xl sm:rounded-2xl border border-gray-200/80 p-4 sm:p-5 hover:border-gray-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-3 sm:space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center">
              <Calendar className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <ArrowUpRight className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 truncate">Upcoming Events</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              {loading ? '—' : events.length}
              <span className="text-xs sm:text-sm font-normal text-gray-400 ml-1.5">events</span>
            </p>
          </div>
        </Link>

        {/* Invoices Metric */}
        <Link
          href="/invoices"
          className="group bg-white rounded-xl sm:rounded-2xl border border-gray-200/80 p-4 sm:p-5 hover:border-gray-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-3 sm:space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center">
              <ReceiptText className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <ArrowUpRight className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 truncate">Collected Income</p>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              {loading ? '—' : `₹${totalRevenue.toLocaleString()}`}
              <span className="text-xs sm:text-sm font-normal text-gray-400 ml-1.5">({pendingInvoicesCount} pend)</span>
            </p>
          </div>
        </Link>
      </div>

      {/* 3. DEDICATED PAGE CARD SEGMENTS (2x2 GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* SEGMENT 1: PROJECTS & TASKS */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex flex-col justify-between space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gray-100 text-gray-900 flex items-center justify-center">
                <FolderKanban className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Projects Overview</h3>
            </div>
            <Link
              href="/projects"
              className="text-xs sm:text-sm font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5 flex-1">
            {loading ? (
              <div className="py-8 flex justify-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-500">No projects in this workspace yet.</p>
                <Link href="/projects" className="text-xs font-bold text-gray-900 hover:underline mt-1 inline-block">
                  + Create first project
                </Link>
              </div>
            ) : (
              projects.slice(0, 3).map(proj => (
                <Link
                  key={proj.id}
                  href="/projects"
                  className="block p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 truncate">{proj.name}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                      proj.status === 'completed'
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {proj.status}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gray-900 h-full rounded-full transition-all"
                        style={{ width: `${proj.progress || 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-400">{proj.progress || 0}%</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* SEGMENT 2: RECENT CHATS */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex flex-col justify-between space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gray-100 text-gray-900 flex items-center justify-center">
                <MessageSquare className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Recent Chats</h3>
            </div>
            <Link
              href="/chats"
              className="text-xs sm:text-sm font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              Open chats <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5 flex-1">
            {loading ? (
              <div className="py-8 flex justify-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : chats.length === 0 ? (
              <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-500">No active conversations yet.</p>
                <Link href="/chats" className="text-xs font-bold text-gray-900 hover:underline mt-1 inline-block">
                  Start a team conversation
                </Link>
              </div>
            ) : (
              chats.slice(0, 3).map(chat => (
                <Link
                  key={chat.id}
                  href="/chats"
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {chat.isChannel ? `# ${chat.name || 'general'}` : (chat.name || 'Direct Message')}
                    </p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {chat.lastMessage?.content || 'No messages yet in this conversation'}
                    </p>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">
                    {chat.lastMessage?.createdAt
                      ? new Date(chat.lastMessage.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : 'Recent'}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* SEGMENT 3: UPCOMING CALENDAR */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex flex-col justify-between space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gray-100 text-gray-900 flex items-center justify-center">
                <Calendar className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Upcoming Calendar</h3>
            </div>
            <Link
              href="/calendar"
              className="text-xs sm:text-sm font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              View calendar <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5 flex-1">
            {loading ? (
              <div className="py-8 flex justify-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : events.length === 0 ? (
              <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-500">No events or meetings scheduled.</p>
                <Link href="/calendar" className="text-xs font-bold text-gray-900 hover:underline mt-1 inline-block">
                  + Schedule event
                </Link>
              </div>
            ) : (
              events.slice(0, 3).map(ev => {
                const dateStr = ev.startDateTime
                  ? new Date(ev.startDateTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : (ev.date || 'Upcoming');
                const timeStr = ev.startDateTime
                  ? new Date(ev.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : (ev.startTime || 'All day');

                return (
                  <Link
                    key={ev.id}
                    href="/calendar"
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {dateStr} • {timeStr} {ev.location ? `(${ev.location})` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize shrink-0">
                      {ev.type || 'Event'}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* SEGMENT 4: CLIENT INVOICES (INCOME) */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 flex flex-col justify-between space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gray-100 text-gray-900 flex items-center justify-center">
                <ReceiptText className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Recent Invoices</h3>
            </div>
            <Link
              href="/invoices"
              className="text-xs sm:text-sm font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              All Invoices <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5 flex-1">
            {loading ? (
              <div className="py-8 flex justify-center text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <p className="text-xs text-gray-500">No invoices generated yet.</p>
                <Link href="/invoices" className="text-xs font-bold text-gray-900 hover:underline mt-1 inline-block">
                  + Create new invoice
                </Link>
              </div>
            ) : (
              invoices.slice(0, 3).map(inv => (
                <Link
                  key={inv.id}
                  href="/invoices"
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50/80 transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {inv.invoiceNumber} {inv.clientName ? `• ${inv.clientName}` : ''}
                    </p>
                    <p className="text-xs font-bold text-gray-700 mt-0.5">
                      ${Number(inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                    inv.status === 'paid'
                      ? 'bg-gray-900 text-white'
                      : inv.status === 'overdue'
                      ? 'bg-gray-200 text-gray-900 font-bold border border-gray-300'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {inv.status}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
