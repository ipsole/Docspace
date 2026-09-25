'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Calendar as CalendarIcon, Plus, X, Loader2, AlertCircle, Clock, MapPin, Building2 } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'event' | 'meeting' | 'task' | 'gst_report' | 'gst_return';
  location?: string;
  description?: string;
  createdBy: string;
  clientId?: string;
  clientName?: string;
  isRecurring?: boolean;
  hasExactTime?: boolean;
}

interface ApiCalendarEvent {
  id: string;
  title: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  type: 'event' | 'meeting';
  location: string;
  createdAt: string;
  clientId?: string;
}

interface Client {
  id: string;
  companyName: string;
  status?: 'active' | 'inactive';
}

interface Project {
  id: string;
  name: string;
  clientId?: string | null;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  dueTime?: string | null;
  clientId?: string | null;
  status: string;
}

function formatTime12(timeStr?: string | null): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function CalendarPage() {
  const { activeWorkspace } = useWorkspace();
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const c = sessionStorage.getItem('cached_calendar_events');
      return c ? JSON.parse(c) : [];
    } catch { return []; }
  });
  const [clients, setClients] = useState<Client[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const c = sessionStorage.getItem('cached_calendar_clients');
      return c ? JSON.parse(c) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return sessionStorage.getItem('cached_calendar_events') ? false : true;
    } catch { return true; }
  });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return sessionStorage.getItem('last_calendar_selected_date') || null;
    } catch { return null; }
  });
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (selectedDate) {
          sessionStorage.setItem('last_calendar_selected_date', selectedDate);
        } else {
          sessionStorage.removeItem('last_calendar_selected_date');
        }
      } catch {}
    }
  }, [selectedDate]);

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [eventType, setEventType] = useState<'event' | 'meeting'>('meeting');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventClientId, setEventClientId] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchEvents = async () => {
    if (!activeWorkspace) return;
    const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem('cached_calendar_events');
    if (!hasCache) setLoading(true);
    try {
      const [eventsRes, projectsRes, tasksRes, clientsRes] = await Promise.all([
        fetch(`/api/calendar?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/projects?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/projects/tasks?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`),
      ]);

      const apiEvents: ApiCalendarEvent[] = eventsRes.ok ? await eventsRes.json() : [];
      const projects: Project[] = projectsRes.ok ? await projectsRes.json() : [];
      const tasks: Task[] = tasksRes.ok ? await tasksRes.json() : [];
      const clientList: Client[] = clientsRes.ok ? await clientsRes.json() : [];
      setClients(clientList);
      
      const projectNameById = new Map(projects.map(project => [project.id, project.name]));
      const projectClientIdById = new Map(projects.map(project => [project.id, project.clientId || null]));
      const clientNameById = new Map(clientList.map(c => [c.id, c.companyName]));
      const validClientIds = new Set(clientList.map(c => c.id));

      const manualEvents: CalendarEvent[] = apiEvents
        .filter(event => {
          // If event is linked to a client, client MUST exist in clientList (active or inactive)
          if (event.clientId && !validClientIds.has(event.clientId)) {
            return false;
          }
          return true;
        })
        .map(event => {
          const start = new Date(event.startDateTime);
          const end = new Date(event.endDateTime);
          const resolvedClientName = event.clientId ? clientNameById.get(event.clientId) : undefined;
          return {
            id: event.id,
            title: event.title,
            date: event.startDateTime.slice(0, 10),
            startTime: start.toTimeString().slice(0, 5),
            endTime: end.toTimeString().slice(0, 5),
            type: event.type,
            location: event.location,
            description: event.description,
            createdBy: '',
            clientId: event.clientId,
            clientName: resolvedClientName,
            hasExactTime: true,
          };
        });

      const taskEvents: CalendarEvent[] = tasks
        .filter(task => {
          if (!task.dueDate) return false;
          // If task has a clientId, client MUST exist in clientList (active or inactive)
          if (task.clientId && !validClientIds.has(task.clientId)) {
            return false;
          }
          // If task project has a clientId, client MUST exist in clientList (active or inactive)
          const projClientId = projectClientIdById.get(task.projectId);
          if (projClientId && !validClientIds.has(projClientId)) {
            return false;
          }
          return true;
        })
        .map(task => {
          const rawDue = task.dueDate as string;
          const datePart = rawDue.includes('T') ? rawDue.split('T')[0] : rawDue;
          const timePart = task.dueTime || (rawDue.includes('T') ? rawDue.split('T')[1].slice(0, 5) : null);
          const startTime = timePart || '18:00';
          let endTime = '18:30';
          if (timePart) {
            const [hStr, mStr] = timePart.split(':');
            const h = parseInt(hStr, 10);
            const m = parseInt(mStr || '0', 10);
            if (!isNaN(h) && !isNaN(m)) {
              const totalMins = h * 60 + m + 30;
              const endH = Math.floor(totalMins / 60) % 24;
              const endM = totalMins % 60;
              endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
            }
          }

          const resolvedClientId = task.clientId || projectClientIdById.get(task.projectId) || undefined;
          const resolvedClientName = resolvedClientId ? clientNameById.get(resolvedClientId) : undefined;
          const projName = projectNameById.get(task.projectId) || 'Project task';

          return {
            id: `task-${task.id}`,
            title: task.title,
            date: datePart,
            startTime,
            endTime,
            type: 'task',
            location: projName,
            description: `Project: ${projName}`,
            createdBy: '',
            clientId: resolvedClientId,
            clientName: resolvedClientName,
            hasExactTime: !!timePart,
          };
        });

      const sorted = [...manualEvents, ...taskEvents].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
      setEvents(sorted);
      try {
        sessionStorage.setItem('cached_calendar_events', JSON.stringify(sorted));
        sessionStorage.setItem('cached_calendar_clients', JSON.stringify(clientList));
      } catch {}
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEvents(); }, [activeWorkspace]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !eventTitle || !eventDate) return;
    setCreating(true);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          title: eventTitle.trim(),
          startDateTime: `${eventDate}T${startTime}:00`,
          endDateTime: `${eventDate}T${endTime}:00`,
          type: eventType,
          location: eventLocation.trim() || undefined,
          description: eventDescription.trim() || undefined,
          clientId: eventClientId || undefined
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setEventTitle(''); setEventDate(''); setStartTime('09:00');
        setEndTime('10:00'); setEventLocation(''); setEventDescription('');
        setEventClientId('');
        fetchEvents();
      }
    } catch { alert('Failed to create event'); }
    finally { setCreating(false); }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Generate recurring GST statutory due dates for current year ± 1 year
  const gstEvents = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = [];
    for (let y = year - 1; y <= year + 1; y++) {
      for (let m = 0; m < 12; m++) {
        const monthNum = String(m + 1).padStart(2, '0');
        const monthName = MONTHS[m];

        // 11th: GSTR-1 Outward Supplies Report
        list.push({
          id: `gst-11-${y}-${monthNum}`,
          title: 'GST Report (GSTR-1) Filing Due Date',
          date: `${y}-${monthNum}-11`,
          startTime: '10:00',
          endTime: '23:59',
          type: 'gst_report',
          location: 'GST Portal (GSTN)',
          description: `Statutory monthly compliance deadline for ${monthName} ${y}: File GSTR-1 (Details of Outward Supplies).`,
          createdBy: 'GST Statutory Calendar',
          isRecurring: true,
          hasExactTime: false,
        });

        // 20th: GSTR-3B Monthly Return & Tax Liability Payment
        list.push({
          id: `gst-20-${y}-${monthNum}`,
          title: 'GST Return & Tax (GSTR-3B) Filing Due Date',
          date: `${y}-${monthNum}-20`,
          startTime: '10:00',
          endTime: '23:59',
          type: 'gst_return',
          location: 'GST Portal (GSTN)',
          description: `Statutory monthly compliance deadline for ${monthName} ${y}: File GSTR-3B monthly return and pay tax liability.`,
          createdBy: 'GST Statutory Calendar',
          isRecurring: true,
          hasExactTime: false,
        });
      }
    }
    return list;
  }, [year]);

  const allEvents = useMemo(() => {
    return [...events, ...gstEvents].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  }, [events, gstEvents]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return allEvents.filter(e => e.date === dateStr);
  };

  // Right sidebar only shows real user deadlines, tasks, and meetings (GST recurring compliance is kept to calendar grid view)
  const sidebarEvents = useMemo(() => {
    if (selectedDate) {
      return events.filter(e => e.date === selectedDate);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    return events
      .filter(e => e.date >= todayStr)
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
      .slice(0, 15);
  }, [selectedDate, events]);

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">No Workspace Selected</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-indigo-500" />
            Calendar
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Schedule and track events, meetings, client deadlines, and GST filing dates.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" /> Add Event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-600 dark:text-slate-400">‹</button>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-600 dark:text-slate-400">›</button>
          </div>

          {/* Days of week */}
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[82px] border-b border-r border-slate-100 dark:border-slate-800/50" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = getEventsForDate(day);
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              const isSelected = selectedDate === dateStr;
              const isGst11 = day === 11;
              const isGst20 = day === 20;

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`min-h-[82px] border-b border-r border-slate-100 dark:border-slate-800/50 p-1.5 cursor-pointer transition-colors relative ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/20'
                      : isGst11
                      ? 'bg-emerald-50/30 dark:bg-emerald-950/15 border-t-2 border-t-emerald-500'
                      : isGst20
                      ? 'bg-rose-50/30 dark:bg-rose-950/15 border-t-2 border-t-rose-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-950/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold inline-flex h-6 w-6 items-center justify-center rounded-full ${
                      isToday ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 dark:text-slate-300'
                    }`}>{day}</span>

                    {/* Prominent recurring GST badges on 11th & 20th */}
                    {isGst11 && (
                      <span className="text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 shadow-2xs">
                        GST Report
                      </span>
                    )}
                    {isGst20 && (
                      <span className="text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 shadow-2xs">
                        GST Return
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map(ev => {
                      if (ev.type === 'gst_report') {
                        return (
                          <div
                            key={ev.id}
                            className="text-[8px] font-extrabold px-1 py-0.5 rounded truncate bg-emerald-600 text-white shadow-2xs flex items-center gap-0.5"
                            title="11th: GSTR-1 Report Due"
                          >
                            <span>📋</span>
                            <span className="truncate">GSTR-1 Due (Report)</span>
                          </div>
                        );
                      }
                      if (ev.type === 'gst_return') {
                        return (
                          <div
                            key={ev.id}
                            className="text-[8px] font-extrabold px-1 py-0.5 rounded truncate bg-rose-600 text-white shadow-2xs flex items-center gap-0.5"
                            title="20th: GSTR-3B Return Due"
                          >
                            <span>🏛️</span>
                            <span className="truncate">GSTR-3B Due (Return)</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={ev.id}
                          className={`text-[8px] font-semibold px-1 py-0.5 rounded truncate ${
                            ev.type === 'meeting' ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' :
                            ev.type === 'task' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-850 dark:text-amber-300' :
                            'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          }`}
                          title={ev.clientName ? `[${ev.clientName}] ${ev.title}` : ev.title}
                        >
                          {ev.clientName ? (
                            <span className="truncate block">
                              <span className="font-extrabold text-[7px] uppercase tracking-tight bg-amber-200/80 dark:bg-amber-800/80 text-amber-950 dark:text-amber-100 px-1 py-0.2 rounded mr-0.5">
                                {ev.clientName}
                              </span>
                              {ev.title}
                            </span>
                          ) : (
                            ev.title
                          )}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && <div className="text-[8px] text-slate-400 font-medium">+{dayEvents.length - 2} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar: selected day events or upcoming */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Upcoming Deadlines & Events'}
            </h3>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
              >
                View All
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              </div>
            ) : sidebarEvents.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No scheduled events or deadlines</p>
              </div>
            ) : (
              sidebarEvents.map(ev => {
                // Regular Task or Meeting Event Card
                return (
                  <div
                    key={ev.id}
                    className={`p-3 rounded-2xl border space-y-2 shadow-2xs ${
                      ev.type === 'meeting'
                        ? 'border-indigo-200/60 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-950/10'
                        : ev.type === 'task'
                        ? 'border-amber-200/60 dark:border-amber-900/30 bg-amber-50/40 dark:bg-amber-950/10'
                        : 'border-emerald-200/60 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-emerald-950/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <p className={`text-xs font-bold ${
                        ev.type === 'meeting' ? 'text-indigo-800 dark:text-indigo-300' :
                        ev.type === 'task' ? 'text-amber-900 dark:text-amber-200' :
                        'text-emerald-800 dark:text-emerald-300'
                      }`}>
                        {ev.title}
                      </p>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 ${
                        ev.type === 'meeting' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' :
                        ev.type === 'task' ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {ev.type === 'task' ? 'Deadline' : ev.type}
                      </span>
                    </div>

                    {/* Client Identification Badge */}
                    {ev.clientName ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700/60 text-[10px] font-bold text-slate-800 dark:text-slate-100">
                        <Building2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <span className="text-slate-400 font-normal">Client:</span>
                        <span className="truncate font-extrabold text-slate-900 dark:text-white">{ev.clientName}</span>
                      </div>
                    ) : (ev.clientId && clients.find(c => c.id === ev.clientId)) ? (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700/60 text-[10px] font-bold text-slate-800 dark:text-slate-100">
                        <Building2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <span className="text-slate-400 font-normal">Client:</span>
                        <span className="truncate">{clients.find(c => c.id === ev.clientId)?.companyName}</span>
                      </div>
                    ) : null}

                    {/* Time */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-350 font-medium">
                      <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{ev.hasExactTime ? `${formatTime12(ev.startTime)} (Due by ${formatTime12(ev.endTime)})` : 'All Day Deadline'}</span>
                    </div>

                    {/* Location / Project */}
                    {ev.location && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{ev.location}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">New Event</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Title *</label>
                <input required type="text" placeholder="e.g. Team Standup" value={eventTitle} onChange={e => setEventTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Date *</label>
                  <input required type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Start Time</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">End Time</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Type</label>
                  <select value={eventType} onChange={e => setEventType(e.target.value as 'event' | 'meeting')}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none transition-all">
                    <option value="meeting">Meeting</option>
                    <option value="event">Event</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Location</label>
                  <input type="text" placeholder="Room / URL" value={eventLocation} onChange={e => setEventLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Linked Client Profile</label>
                  <select value={eventClientId} onChange={e => setEventClientId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none transition-all">
                    <option value="">No Client Linked</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.companyName}{c.status === 'inactive' ? ' (Inactive)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">Cancel</button>
                <button type="submit" disabled={creating} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
