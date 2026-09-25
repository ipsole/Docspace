'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import {
  FolderKanban, Plus, X, Loader2, AlertCircle, CheckSquare,
  Calendar, Clock, Trash2, Edit3, Building2, DollarSign, Check,
  MessageSquare, ChevronRight, Play, Square, ListTodo,
  Columns, Table, Search, Filter, AlertTriangle, ArrowRight,
  ChevronDown, Eye, Paperclip
} from 'lucide-react';

import { uploadFile, uploadFolder } from '@/lib/uploadHelper';
import CustomDropdown from '@/components/CustomDropdown';
import TaskStatusDropdown from '@/components/TaskStatusDropdown';

interface Task {
  id: string;
  projectId: string;
  workspaceId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'review' | 'done';
  tags: string[];
  subtasks: { id: string; title: string; completed: boolean }[];
  dependencies: string[];
  timeSpentSec: number;
  createdAt: string;
  
  // Custom metadata fields
  money?: number | null;
  clientId?: string | null;
  comments?: { id: string; senderName: string; content: string; createdAt: string }[];
  attachments?: any[];
}

interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  clientId?: string | null;
  members: string[];
  tasks: Task[];
  progress: number;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';
  createdAt: string;
  businessType?: string | null;
}

interface Client {
  id: string;
  companyName: string;
  contactPerson: string;
  status?: 'active' | 'inactive';
}

const PRIORITY_MAP = {
  low:    { label: 'Low',    color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  medium: { label: 'Medium', color: 'text-zinc-600 bg-zinc-100 dark:bg-zinc-850' },
  high:   { label: 'High',   color: 'text-slate-900 bg-slate-200 dark:bg-slate-700 font-medium' },
  urgent: { label: 'Urgent', color: 'text-white bg-slate-950 dark:bg-slate-100 dark:text-slate-950 font-black' },
};

function renderTextWithLinks(text: string) {
  if (!text) return '—';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 hover:underline break-all inline"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

const STATUS_MAP = {
  todo:        { label: 'Not started', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  in_progress: { label: 'In progress', color: 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800' },
  review:      { label: 'Review',      color: 'text-slate-900 bg-slate-200 dark:bg-slate-700' },
  done:        { label: 'Completed',   color: 'text-black bg-slate-350 dark:bg-slate-600' },
};

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

function formatDeadlineDisplay(dateStr?: string | null, timeStr?: string | null): string {
  if (!dateStr) return '—';
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const cleanTime = timeStr || (dateStr.includes('T') ? dateStr.split('T')[1].slice(0, 5) : null);
  if (!cleanTime) return cleanDate;
  return `${cleanDate} · ${formatTime12(cleanTime)}`;
}

export default function ProjectsPage() {
  const { activeWorkspace, getTabAccess } = useWorkspace();
  const isReadOnly = getTabAccess('projects') === 'view';
  const { user } = useAuth();
  const confirm = useConfirm();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Attachment states
  const [chatAttachments, setChatAttachments] = useState<any[]>([]);
  const [fetchingChats, setFetchingChats] = useState(false);
  const [showChatFilesDropdown, setShowChatFilesDropdown] = useState(false);
  
  // Selected state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');
  
  // View mode & filters
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterMyTasks, setFilterMyTasks] = useState(false);
  const [collapsedTables, setCollapsedTables] = useState<Record<string, boolean>>({});

  // Restore session cache once mounted in browser to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const cachedProjects = sessionStorage.getItem('cached_projects_list');
        if (cachedProjects) {
          const list: Project[] = JSON.parse(cachedProjects);
          setProjects(list);
          const savedId = sessionStorage.getItem('last_active_project_id');
          if (savedId) {
            const p = list.find(x => x.id === savedId);
            if (p) setSelectedProject(p);
          }
          const savedTaskId = sessionStorage.getItem('last_active_project_task_id');
          if (savedTaskId) {
            for (const p of list) {
              const t = p.tasks?.find(x => x.id === savedTaskId);
              if (t) { setSelectedTask(t); break; }
            }
          }
          setLoading(false);
        }

        const cachedClients = sessionStorage.getItem('cached_projects_clients');
        if (cachedClients) setClients(JSON.parse(cachedClients));

        const savedViewMode = sessionStorage.getItem('last_projects_view_mode');
        if (savedViewMode) setViewMode(savedViewMode as any);

        const savedPriority = sessionStorage.getItem('last_projects_priority_filter');
        if (savedPriority) setFilterPriority(savedPriority);
      } catch {}
    }
  }, []);

  // Persistence effects (only after mounted)
  useEffect(() => {
    if (mounted && selectedProject && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_active_project_id', selectedProject.id);
      } catch {}
    }
  }, [selectedProject?.id, mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        if (selectedTask) {
          sessionStorage.setItem('last_active_project_task_id', selectedTask.id);
        } else {
          sessionStorage.removeItem('last_active_project_task_id');
        }
      } catch {}
    }
  }, [selectedTask?.id, mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_projects_view_mode', viewMode);
      } catch {}
    }
  }, [viewMode, mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_projects_priority_filter', filterPriority);
      } catch {}
    }
  }, [filterPriority, mounted]);

  // Priority filter custom dropdown state
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target as Node)) {
        setShowPriorityDropdown(false);
      }
    };
    if (showPriorityDropdown) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [showPriorityDropdown]);

  // Modals / UI views
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  
  // Project form fields
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projBusinessType, setProjBusinessType] = useState('B2B');
  const [projStatus, setProjStatus] = useState<Project['status']>('planning');
  const [creatingProj, setCreatingProj] = useState(false);

  // Side drawer properties editing
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerDesc, setDrawerDesc] = useState('');
  const [drawerMoney, setDrawerMoney] = useState<string>('');
  const [drawerDue, setDrawerDue] = useState('');
  const [drawerDueTime, setDrawerDueTime] = useState('');
  const deadlinePickerRef = useRef<HTMLInputElement>(null);
  const deadlineTimePickerRef = useRef<HTMLInputElement>(null);
  const [drawerPriority, setDrawerPriority] = useState<Task['priority']>('medium');
  const [drawerStatus, setDrawerStatus] = useState<Task['status']>('todo');
  const [drawerClientId, setDrawerClientId] = useState('');

  // Drawer checklist & comments states
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);
  const [pendingUpload, setPendingUpload] = useState<{
    files: { file: File; path?: string }[];
    name: string;
    isFolder: boolean;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; percent: number } | null>(null);
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
  const [compressLocally, setCompressLocally] = useState(true);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [savingTaskField, setSavingTaskField] = useState(false);
  const [inlineAddStatus, setInlineAddStatus] = useState<Task['status'] | null>(null);
  const [inlineAddTitle, setInlineAddTitle] = useState('');
  const [savingInline, setSavingInline] = useState(false);


  const fetchProjects = async () => {
    if (!activeWorkspace) return;
    const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem('cached_projects_list');
    if (!hasCache) setLoading(true);
    try {
      const [projectsRes, clientsRes, tasksRes] = await Promise.all([
        fetch(`/api/projects?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/projects/tasks?workspaceId=${activeWorkspace.id}`),
      ]);
      const tasks: Task[] = tasksRes.ok ? await tasksRes.json() : [];
      
      let clientList: Client[] = [];
      if (clientsRes.ok) {
        clientList = await clientsRes.json();
        const validClients = Array.isArray(clientList) ? clientList : [];
        setClients(validClients);
        try { sessionStorage.setItem('cached_projects_clients', JSON.stringify(validClients)); } catch {}
      }

      if (projectsRes.ok) {
        const projs: Omit<Project, 'tasks'>[] = await projectsRes.json();
        const validClientIds = new Set(clientList.map(c => c.id));
        const validTasks = tasks.filter(task => !task.clientId || validClientIds.has(task.clientId));
        const hydrated = Array.isArray(projs)
          ? projs
              .filter(project => !project.clientId || validClientIds.has(project.clientId))
              .map(project => ({
                ...project,
                tasks: validTasks.filter(task => (task as any).projectId === project.id),
              }))
          : [];
        setProjects(hydrated);
        try { sessionStorage.setItem('cached_projects_list', JSON.stringify(hydrated)); } catch {}

        // Update selected project state
        const lastProjId = typeof window !== 'undefined'
          ? (sessionStorage.getItem('last_active_project_id') || localStorage.getItem(`lastProjId_${activeWorkspace.id}`))
          : null;
        const savedProj = lastProjId ? hydrated.find(p => p.id === lastProjId) : null;

        setSelectedProject(prev => {
          if (prev) {
            return hydrated.find(p => p.id === prev.id) || null;
          }
          if (savedProj) return savedProj;
          return hydrated.length > 0 ? hydrated[0] : null;
        });

        // Update selected task state
        setSelectedTask(prev => {
          if (!prev) return null;
          for (const p of hydrated) {
            const fresh = p.tasks.find(t => t.id === prev.id);
            if (fresh) {
              setDrawerTitle(fresh.title);
              setDrawerDesc(fresh.description || '');
              setDrawerMoney(fresh.money ? String(fresh.money) : '');
              const rawDue = fresh.dueDate || '';
              const dateVal = rawDue.includes('T') ? rawDue.split('T')[0] : rawDue;
              const timeVal = fresh.dueTime || (rawDue.includes('T') ? rawDue.split('T')[1].slice(0, 5) : '');
              setDrawerDue(dateVal);
              setDrawerDueTime(timeVal);
              setDrawerPriority(fresh.priority);
              setDrawerStatus(fresh.status);
              setDrawerClientId(fresh.clientId || '');
              return fresh;
            }
          }
          return null;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [activeWorkspace]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddProject(false);
        setPendingUpload(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle Project Create / Edit
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !projName.trim()) return;
    setCreatingProj(true);
    try {
      const res = await fetch('/api/projects', {
        method: editingProject ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProject?.id,
          workspaceId: activeWorkspace.id,
          name: projName.trim(),
          description: projDesc.trim(),
          clientId: null,
          businessType: projBusinessType || 'B2B',
          status: projStatus,
        }),
      });
      if (res.ok) {
        setShowAddProject(false);
        setEditingProject(null);
        setProjName(''); setProjDesc(''); setProjBusinessType('B2B'); setProjStatus('planning');
        await fetchProjects();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingProj(false);
    }
  };

  const openCreateProject = () => {
    setEditingProject(null);
    setProjName('');
    setProjDesc('');
    setProjBusinessType('B2B');
    setProjStatus('planning');
    setShowAddProject(true);
  };

  const openEditProject = (project: Project) => {
    setEditingProject(project);
    setProjName(project.name);
    setProjDesc(project.description || '');
    setProjBusinessType(project.businessType || 'B2B');
    setProjStatus(project.status);
    setShowAddProject(true);
  };

  const handleDeleteProject = async (projId: string) => {
    if (!activeWorkspace) return;
    const ok = await confirm({
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project? All associated tasks will be permanently removed.',
      confirmText: 'Delete Project',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await fetch(`/api/projects?id=${projId}&workspaceId=${activeWorkspace.id}`, {
        method: 'DELETE'
      });
      if (selectedProject?.id === projId) {
        setSelectedProject(null);
        setSelectedTask(null);
      }
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  // Open the inline input row — does NOT touch the API yet
  const handleOpenInlineAdd = (status: Task['status']) => {
    setInlineAddStatus(status);
    setInlineAddTitle('');
  };

  // Cancel inline add without saving
  const handleCancelInlineAdd = () => {
    setInlineAddStatus(null);
    setInlineAddTitle('');
  };

  // Confirm: save to API then open the drawer for the new task
  const handleSaveInlineTask = async () => {
    if (!selectedProject || !activeWorkspace || savingInline) return;
    const title = inlineAddTitle.trim();
    if (!title) return;
    setSavingInline(true);
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          projectId: selectedProject.id,
          title,
          description: '',
          priority: 'medium',
          status: inlineAddStatus,
          dueDate: null,
          money: null,
          clientId: (selectedProject.clientId && clients.some(c => c.id === selectedProject.clientId && c.status !== 'inactive')) ? selectedProject.clientId : null,
          subtasks: [],
          tags: []
        }),
      });
      if (res.ok) {
        const newTask = await res.json();
        setInlineAddStatus(null);
        setInlineAddTitle('');
        await fetchProjects();
        handleSelectTask(newTask, 'edit');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingInline(false);
    }
  };



  const handleUpdateTaskStatus = async (task: Task, nextStatus: 'todo' | 'in_progress' | 'review' | 'done', e?: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!activeWorkspace) return;
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          id: task.id,
          status: nextStatus
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (selectedTask?.id === task.id) {
          setSelectedTask(updated);
        }
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTaskStatus = async (task: Task, e?: React.MouseEvent) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    await handleUpdateTaskStatus(task, next as any, e);
  };

  // Open Drawer for Task
  const handleSelectTask = (task: Task, mode: 'view' | 'edit' = 'view') => {
    setSelectedTask(task);
    setDrawerMode(mode);
    setDrawerTitle(task.title);
    setDrawerDesc(task.description || '');
    setDrawerMoney(task.money ? String(task.money) : '');
    const rawDue = task.dueDate || '';
    const dateVal = rawDue.includes('T') ? rawDue.split('T')[0] : rawDue;
    const timeVal = task.dueTime || (rawDue.includes('T') ? rawDue.split('T')[1].slice(0, 5) : '');
    setDrawerDue(dateVal);
    setDrawerDueTime(timeVal);
    setDrawerPriority(task.priority);
    setDrawerStatus(task.status);
    setDrawerClientId(task.clientId || '');
    setNewSubtaskTitle('');
    setNewCommentText('');
  };

  // Generic Task Field updates (saves metadata immediately to API)
  const handleUpdateTaskField = async (fields: Partial<Task>) => {
    if (!selectedTask || !activeWorkspace) return;
    setSavingTaskField(true);
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTask.id,
          workspaceId: activeWorkspace.id,
          ...fields
        })
      });
      if (res.ok) {
        await fetchProjects();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTaskField(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const uploadTaskFile = async (file: File) => {
    if (!file || !selectedTask) return;
    setSavingTaskField(true);
    setUploadProgress({ name: file.name, percent: 0 });
    try {
      const uploaded = await uploadFile(file, {
        type: 'upload',
        onProgress: (event) => {
          setUploadProgress({ name: file.name, percent: event.percentage });
        }
      });
      const newAtt = {
        id: uploaded.id,
        name: uploaded.name,
        url: uploaded.url,
        size: uploaded.size,
        mimeType: uploaded.mimeType
      };
      const updated = [...(selectedTask.attachments || []), newAtt];
      handleUpdateTaskField({ attachments: updated });
      setSelectedTask(prev => prev ? { ...prev, attachments: updated } : null);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Upload failed');
    } finally {
      setSavingTaskField(false);
      setUploadProgress(null);
    }
  };

  const traverseFileTree = async (item: any, path = '') => {
    const files: { file: File; path: string }[] = [];
    
    const readDirectory = (dirEntry: any): Promise<any[]> => {
      const dirReader = dirEntry.createReader();
      return new Promise((resolve) => {
        const allEntries: any[] = [];
        const readEntries = () => {
          dirReader.readEntries((entries: any[]) => {
            if (entries.length) {
              allEntries.push(...entries);
              readEntries();
            } else {
              resolve(allEntries);
            }
          });
        };
        readEntries();
      });
    };

    const processEntry = async (entry: any, currentPath: string) => {
      const ignoredNames = ['node_modules', '.git', '.next', 'dist', 'build', '.idea', '.vscode', '.DS_Store'];
      if (ignoredNames.includes(entry.name)) {
        return;
      }

      if (entry.isFile) {
        const file = await new Promise<File>((resolve) => entry.file(resolve));
        files.push({ file, path: currentPath + file.name });
      } else if (entry.isDirectory) {
        const entries = await readDirectory(entry);
        for (const childEntry of entries) {
          await processEntry(childEntry, currentPath + entry.name + '/');
        }
      }
    };

    await processEntry(item, path);
    return files;
  };

  const loadJSZip = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).JSZip) {
        resolve((window as any).JSZip);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve((window as any).JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip library'));
      document.body.appendChild(script);
    });
  };

  const executePendingUpload = async () => {
    if (!pendingUpload || !selectedTask || !activeWorkspace) return;
    const { files, name, isFolder } = pendingUpload;
    setPendingUpload(null);
    setSavingTaskField(true);

    try {
      let uploadedData: any = null;

      if (isFolder) {
        setUploadProgress({ name, percent: 0 });
        uploadedData = await uploadFolder(files.map(f => ({ file: f.file, path: f.path || f.file.name })), name, {
          onProgress: (event) => {
            setUploadProgress({ name, percent: event.percentage });
          }
        });
      } else {
        // Single file upload
        const file = files[0].file;
        setUploadProgress({ name: file.name, percent: 0 });

        uploadedData = await uploadFile(file, {
          onProgress: (event) => {
            setUploadProgress({ name: file.name, percent: event.percentage });
          }
        });
      }

      if (uploadedData) {
        const newAtt = {
          id: uploadedData.id,
          name: uploadedData.name,
          url: uploadedData.url,
          size: uploadedData.size,
          mimeType: uploadedData.mimeType
        };
        const updated = [...(selectedTask.attachments || []), newAtt];
        handleUpdateTaskField({ attachments: updated });
        setSelectedTask(prev => prev ? { ...prev, attachments: updated } : null);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Upload failed');
    } finally {
      setSavingTaskField(false);
      setUploadProgress(null);
      setZipProgress(null);
    }
  };

  const triggerFileDownload = (fileUrl: string, fileName: string, fileId: string) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', fileUrl);
    xhr.responseType = 'blob';
    
    setDownloadProgresses(prev => ({ ...prev, [fileId]: 0 }));

    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        setDownloadProgresses(prev => ({ ...prev, [fileId]: percentage }));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const blob = xhr.response;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert('Download failed');
      }
      setTimeout(() => {
        setDownloadProgresses(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }, 1000);
    };

    xhr.onerror = () => {
      alert('Download failed');
      setDownloadProgresses(prev => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    };

    xhr.send();
  };

  const handleDragStart = (e: React.DragEvent, file: { url: string; name: string; mimeType: string }) => {
    const downloadUrl = `${window.location.origin}${file.url}`;
    e.dataTransfer.setData('DownloadURL', `${file.mimeType || 'application/octet-stream'}:${file.name}:${downloadUrl}`);
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingUpload({
        files: [{ file }],
        name: file.name,
        isFolder: false
      });
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (drawerMode === 'edit' && e.dataTransfer.types.includes('Files')) {
      dragCounter.current++;
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (drawerMode === 'edit') {
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        setIsDraggingFile(false);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (drawerMode === 'edit') {
      setIsDraggingFile(false);
      dragCounter.current = 0;
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const fileEntries: { file: File; path: string }[] = [];
        let rootFolderName = '';

        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) {
            if (entry.isDirectory && !rootFolderName) {
              rootFolderName = entry.name;
            }
            const files = await traverseFileTree(entry);
            fileEntries.push(...files);
          }
        }

        if (fileEntries.length === 0) return;

        if (fileEntries.length === 1 && rootFolderName === '') {
          setPendingUpload({
            files: [{ file: fileEntries[0].file }],
            name: fileEntries[0].file.name,
            isFolder: false
          });
        } else {
          setPendingUpload({
            files: fileEntries,
            name: rootFolderName || 'Archive',
            isFolder: true
          });
        }
      }
    }
  };

  const handlePasteInDrawer = (e: React.ClipboardEvent) => {
    if (drawerMode !== 'edit') return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setPendingUpload({
            files: [{ file }],
            name: file.name,
            isFolder: false
          });
        }
      }
    }
  };

  const loadChatAttachments = async () => {
    if (!activeWorkspace) return;
    setFetchingChats(true);
    try {
      const chatsRes = await fetch(`/api/chat?workspaceId=${activeWorkspace.id}`);
      if (!chatsRes.ok) return;
      const chats = await chatsRes.json();
      const files: any[] = [];
      for (const chat of chats) {
        const msgRes = await fetch(`/api/chat/message?chatId=${chat.id}`);
        if (msgRes.ok) {
          const msgs = await msgRes.json();
          for (const msg of msgs) {
            if (msg.attachments && msg.attachments.length > 0) {
              for (const att of msg.attachments) {
                files.push({
                  ...att,
                  chatName: chat.name || 'Direct Chat',
                  senderName: msg.senderName || 'Workspace Member',
                  createdAt: msg.createdAt
                });
              }
            }
          }
        }
      }
      setChatAttachments(files);
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingChats(false);
    }
  };

  // Toggle Subtask checkbox
  const handleToggleSubtask = async (subtaskId: string, currentVal: boolean) => {
    if (!selectedTask) return;
    const updatedSubtasks = (selectedTask.subtasks || []).map(st => 
      st.id === subtaskId ? { ...st, completed: !currentVal } : st
    );
    await handleUpdateTaskField({ subtasks: updatedSubtasks });
  };

  // Add Subtask
  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newSubtaskTitle.trim()) return;
    const newSub = {
      id: Math.random().toString(36).substr(2, 9),
      title: newSubtaskTitle.trim(),
      completed: false
    };
    const updatedSubtasks = [...(selectedTask.subtasks || []), newSub];
    setNewSubtaskTitle('');
    await handleUpdateTaskField({ subtasks: updatedSubtasks });
  };

  // Delete Subtask
  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!selectedTask) return;
    const ok = await confirm({
      title: 'Delete Subtask',
      message: 'Are you sure you want to remove this subtask?',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    const updatedSubtasks = (selectedTask.subtasks || []).filter(st => st.id !== subtaskId);
    await handleUpdateTaskField({ subtasks: updatedSubtasks });
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newCommentText.trim()) return;
    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      senderName: user?.displayName || user?.username || 'User',
      content: newCommentText.trim(),
      createdAt: new Date().toISOString()
    };
    const updatedComments = [...(selectedTask.comments || []), newComment];
    setNewCommentText('');
    await handleUpdateTaskField({ comments: updatedComments });
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (!activeWorkspace) return;
    const ok = await confirm({
      title: 'Delete Stage / Task',
      message: 'Are you sure you want to delete this task?',
      confirmText: 'Delete Task',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await fetch(`/api/projects/tasks?id=${taskId}&workspaceId=${activeWorkspace.id}`, { method: 'DELETE' });
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  // Client name getter
  const getClientName = (id?: string | null) => {
    return clients.find(c => c.id === id)?.companyName || '—';
  };

  // Only active clients for selection dropdowns and suggestions (exclude inactive clients)
  const activeClients = useMemo(() => {
    return clients.filter(c => c.status !== 'inactive');
  }, [clients]);

  // Toggle Collapse status table
  const toggleCollapse = (statusKey: string) => {
    setCollapsedTables(prev => ({ ...prev, [statusKey]: !prev[statusKey] }));
  };

  // Filtered tasks array based on search and priority/owner filters
  const filteredProjectTasks = useMemo(() => {
    if (!selectedProject) return [];
    let tasks = selectedProject.tasks || [];
    const validClientIds = new Set(clients.map(c => c.id));
    tasks = tasks.filter(t => !t.clientId || validClientIds.has(t.clientId));

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.description.toLowerCase().includes(q) ||
        getClientName(t.clientId).toLowerCase().includes(q)
      );
    }

    // Priority filter
    if (filterPriority !== 'all') {
      tasks = tasks.filter(t => t.priority === filterPriority);
    }

    // My tasks filter (assigned to current user)
    if (filterMyTasks && user) {
      tasks = tasks.filter(t => t.assigneeId === user.id);
    }

    return tasks;
  }, [selectedProject, searchQuery, filterPriority, filterMyTasks, user, clients]);

  // Group task list by status
  const tasksByStatus = useMemo(() => {
    const tasks = filteredProjectTasks;
    return {
      todo:        tasks.filter(t => t.status === 'todo'),
      in_progress: tasks.filter(t => t.status === 'in_progress'),
      review:      tasks.filter(t => t.status === 'review'),
      done:        tasks.filter(t => t.status === 'done'),
    };
  }, [filteredProjectTasks]);

  // Key stats computations for dashboard overview
  const projectStats = useMemo(() => {
    if (!selectedProject) return { totalTasks: 0, completed: 0, pending: 0, moneyTotal: 0, urgentCount: 0 };
    const tasks = selectedProject.tasks || [];
    return {
      totalTasks: tasks.length,
      completed: tasks.filter(t => t.status === 'done').length,
      pending: tasks.filter(t => t.status !== 'done').length,
      moneyTotal: tasks.reduce((sum, t) => sum + (t.money || 0), 0),
      urgentCount: tasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length
    };
  }, [selectedProject]);

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">No Workspace Selected</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 md:p-8 min-h-screen flex flex-col gap-4 sm:gap-6 max-w-7xl mx-auto text-slate-800 dark:text-slate-200 pb-16">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 mb-1">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-slate-800 dark:text-slate-100 shrink-0" />
            <span>Projects</span>
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Manage projects and track task stages across your workspace.
          </p>
        </div>

        {/* Small Project Selector Dropdown */}
        {projects.length > 0 && (
          <div className="flex items-center justify-between sm:justify-start gap-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 px-2.5 py-1 rounded-2xl shadow-sm text-xs font-semibold w-full sm:w-auto">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px] whitespace-nowrap shrink-0 pl-1">Active:</span>
            <CustomDropdown
              value={selectedProject?.id || ''}
              onChange={val => {
                const p = projects.find(proj => proj.id === val);
                if (p) {
                  setSelectedProject(p);
                  setSelectedTask(null);
                  if (activeWorkspace) {
                    localStorage.setItem(`lastProjId_${activeWorkspace.id}`, p.id);
                  }
                }
              }}
              options={projects.map(proj => ({
                value: proj.id,
                label: `${proj.name} (${proj.businessType || 'B2B'})`
              }))}
              buttonClassName="bg-transparent text-xs font-black text-slate-800 dark:text-slate-100 cursor-pointer flex items-center gap-1.5 focus:outline-none"
              title="Select Active Project"
            />
            
            {selectedProject && (
              <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2 ml-1 shrink-0">
                <button
                  onClick={() => openEditProject(selectedProject)}
                  className="p-1 text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  title="Edit project details"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteProject(selectedProject.id)}
                  className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-955/20"
                  title="Delete project"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {!isReadOnly && (
                  <>
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                    <button
                      type="button"
                      onClick={openCreateProject}
                      className="p-1 text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      title="New Project"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>


      {/* Main Layout Container */}
      <div className="flex flex-col gap-6 relative">

        {/* Selected Project Database Board */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex flex-col relative shadow-sm">
          {!selectedProject ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <FolderKanban className="h-10 w-10 text-slate-350 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold text-slate-500">No Project Active</p>
              <p className="text-[10px] text-slate-400 mt-1">Select or create a project to inspect and manage its execution board.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              
              {/* TOOLBAR FOR DENSE CONTROLS & VIEWS */}
              <div className="px-3 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                
                {/* Search & Filters */}
                <div className="flex items-center flex-wrap gap-2 flex-1 w-full">
                  <div className="relative flex-1 min-w-[150px] sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search stages or clients..."
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none"
                      style={{ paddingLeft: '2.35rem' }}
                    />
                  </div>
                  
                  {/* Priority Filter Custom Dropdown */}
                  <div className="relative shrink-0" ref={priorityDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowPriorityDropdown(prev => !prev)}
                      className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 focus:outline-none hover:border-slate-300 transition-colors cursor-pointer"
                    >
                      <span>
                        {filterPriority === 'all'
                          ? 'All Priorities'
                          : filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1)}
                      </span>
                      <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                    </button>

                    {showPriorityDropdown && (
                      <div className="absolute left-0 top-full mt-1.5 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 py-1 text-xs animate-in fade-in zoom-in-95 duration-100">
                        {[
                          { id: 'all', label: 'All Priorities' },
                          { id: 'low', label: 'Low' },
                          { id: 'medium', label: 'Medium' },
                          { id: 'high', label: 'High' },
                          { id: 'urgent', label: 'Urgent' },
                        ].map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setFilterPriority(p.id);
                              setShowPriorityDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer ${
                              filterPriority === p.id ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span>{p.label}</span>
                            {filterPriority === p.id && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Toggle Assigned to Me */}
                  <button
                    onClick={() => setFilterMyTasks(!filterMyTasks)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      filterMyTasks
                        ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900'
                        : 'bg-slate-50 border-slate-200 dark:border-slate-800 text-slate-650'
                    }`}
                  >
                    Assigned to me
                  </button>
                </div>

                {/* View Mode Toggle: Table / Kanban */}
                <div className="flex items-center justify-between sm:justify-end gap-1 bg-slate-100 dark:bg-slate-955 p-1 border border-slate-200/50 dark:border-slate-800/50 rounded-xl shrink-0 self-start sm:self-auto">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      viewMode === 'table'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Table className="h-3 w-3" /> Table
                  </button>
                  <button
                    onClick={() => setViewMode('kanban')}
                    className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      viewMode === 'kanban'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Columns className="h-3 w-3" /> Kanban
                  </button>
                </div>

              </div>

              {/* VIEW 1: DENSE DATABASE TABLE VIEW */}
              {viewMode === 'table' && (
                <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 w-full pb-12">
                  {(Object.keys(STATUS_MAP) as Task['status'][]).map(statusKey => {
                    const statusInfo = STATUS_MAP[statusKey];
                    const statusTasks = tasksByStatus[statusKey] || [];
                    const isCollapsed = collapsedTables[statusKey];
                    
                    return (
                      <div key={statusKey} className="space-y-3">
                        
                        {/* Expand/Collapse Header */}
                        <div 
                          className="flex items-center justify-between p-3 sm:p-3.5 bg-black dark:bg-white hover:bg-zinc-900 dark:hover:bg-zinc-100 border border-black dark:border-white rounded-2xl cursor-pointer select-none group/status shadow-sm transition-all"
                          onClick={() => toggleCollapse(statusKey)}
                        >
                          <div className="flex items-center gap-2 sm:gap-2.5">
                            <ChevronDown className={`h-4 w-4 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 text-white dark:text-black">
                              <span className={`w-2.5 h-2.5 rounded-full ${
                                statusKey === 'todo' ? 'bg-amber-400' :
                                statusKey === 'in_progress' ? 'bg-blue-400 animate-pulse' :
                                statusKey === 'review' ? 'bg-purple-400' : 'bg-emerald-400'
                              }`} />
                              {statusInfo.label}
                            </span>
                            <span className="text-[10px] font-bold text-black dark:text-white px-2 py-0.5 bg-white dark:bg-black border border-white/10 dark:border-black/10 rounded-full">
                              {statusTasks.length} {statusTasks.length === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible content wrapper */}
                        {!isCollapsed && (
                          <div className="transition-all duration-200">
                            <div className="border border-slate-250 dark:border-slate-800/75 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm transition-all duration-200">
                              <div className="overflow-x-auto w-full no-scrollbar">
                                <table className="w-full min-w-[680px] text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-950/20 text-slate-500 font-bold border-b border-slate-205 dark:border-slate-800/60">
                                    <th className="p-3 w-[35%]">Stage / Task Name</th>
                                    <th className="p-3 w-[15%]">Client</th>
                                    <th className="p-3 w-[15%]">Due Date</th>
                                    <th className="p-3 w-[10%]">Budget</th>
                                    <th className="p-3 w-[15%]">Stage Notes</th>
                                    <th className="p-3 w-[10%]">Priority</th>
                                    <th className="p-3 w-[10%] text-center">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {statusTasks.length === 0 ? (
                                    <tr>
                                      <td colSpan={7} className="p-4 text-center text-slate-400 text-[10px]">
                                        No items in this stage
                                      </td>
                                    </tr>
                                  ) : (
                                    statusTasks.map(task => {
                                      const priorityInfo = PRIORITY_MAP[task.priority];
                                      return (
                                        <tr
                                          key={task.id}
                                          onClick={() => handleSelectTask(task)}
                                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-all border-b border-slate-100 dark:border-slate-850 cursor-pointer ${
                                            selectedTask?.id === task.id ? 'bg-slate-50/95 dark:bg-slate-950/20 font-medium' : ''
                                          }`}
                                        >
                                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-150 truncate max-w-[200px]" title={task.title}>
                                            <div className="flex items-center gap-2">
                                              <TaskStatusDropdown
                                                status={task.status}
                                                onChange={(newStatus) => handleUpdateTaskStatus(task, newStatus)}
                                              />
                                              <span className={`${task.status === 'done' ? 'line-through text-slate-400 dark:text-slate-500 font-normal' : ''}`}>
                                                {task.title || 'Untitled Stage'}
                                              </span>
                                            </div>
                                          </td>
                                          
                                          <td className="p-3 text-slate-505 truncate max-w-[120px]">
                                            <span className="flex items-center gap-1">
                                              <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                                              {getClientName(task.clientId)}
                                            </span>
                                          </td>

                                          <td className="p-3 text-slate-500 whitespace-nowrap">
                                            {task.dueDate ? (
                                              <span className="flex items-center gap-1.5 font-medium" title={formatDeadlineDisplay(task.dueDate, task.dueTime)}>
                                                <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                                                <span>{formatDeadlineDisplay(task.dueDate, task.dueTime)}</span>
                                              </span>
                                            ) : '—'}
                                          </td>

                                          <td className="p-3 text-slate-600 dark:text-slate-350 font-bold whitespace-nowrap">
                                            {task.money ? `₹${task.money}` : '—'}
                                          </td>

                                          <td className="p-3 text-slate-400 truncate max-w-[160px]" title={task.description}>
                                            {task.description || '—'}
                                          </td>

                                          <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap font-medium ${priorityInfo?.color}`}>
                                              {priorityInfo?.label}
                                            </span>
                                          </td>

                                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1.5">
                                              <button
                                                onClick={() => handleSelectTask(task, 'edit')}
                                                className="p-1 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-205 text-slate-400 transition-all rounded-lg"
                                                title="Edit Stage Details"
                                              >
                                                <Edit3 className="h-3.5 w-3.5" />
                                              </button>
                                              <button
                                                onClick={() => handleDeleteTask(task.id)}
                                                className="p-1 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-955/20 text-slate-400 transition-all rounded-lg"
                                                title="Delete Stage Row"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                            
                            {/* Add Inline Row */}
                            {inlineAddStatus === statusKey ? (
                              /* Inline form: type name and hit Enter or Save */
                              <div className="flex items-center gap-2 px-3 py-2 mt-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
                                <input
                                  autoFocus
                                  type="text"
                                  value={inlineAddTitle}
                                  onChange={e => setInlineAddTitle(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveInlineTask();
                                    if (e.key === 'Escape') handleCancelInlineAdd();
                                  }}
                                  placeholder="Stage / task name..."
                                  className="flex-1 text-xs bg-transparent border-none outline-none focus:outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400"
                                  style={{ border: 'none', boxShadow: 'none', padding: '0' }}
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveInlineTask}
                                  disabled={savingInline || !inlineAddTitle.trim()}
                                  className="px-2.5 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-[10px] font-bold hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                                >
                                  {savingInline ? '...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelInlineAdd}
                                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-all cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenInlineAdd(statusKey)}
                                className="flex items-center gap-1.5 px-3.5 py-2 text-[11px] text-slate-450 hover:text-slate-800 dark:hover:text-slate-100 font-bold transition-all rounded-lg mt-1.5 hover:bg-slate-50 dark:hover:bg-slate-950"
                              >
                                <Plus className="h-3.5 w-3.5" /> Add Stage / Task Item
                              </button>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

              {/* VIEW 2: VISUAL KANBAN BOARD VIEW (SIDE-BY-SIDE DRAG SCANS) */}
              {viewMode === 'kanban' && (
                <div className="overflow-x-auto p-6 flex gap-4 items-start pb-12">
                  {(Object.keys(STATUS_MAP) as Task['status'][]).map(statusKey => {
                    const statusInfo = STATUS_MAP[statusKey];
                    const statusTasks = tasksByStatus[statusKey] || [];
                    
                    return (
                      <div key={statusKey} className="w-72 shrink-0 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/40 flex flex-col">
                        
                        {/* Column Header */}
                        <div className="flex items-center justify-between mb-3 shrink-0 px-1">
                          <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 text-slate-700 dark:text-slate-350">
                            <span className={`w-2 h-2 rounded-full ${
                              statusKey === 'todo' ? 'bg-slate-400' :
                              statusKey === 'in_progress' ? 'bg-zinc-555' :
                              statusKey === 'review' ? 'bg-slate-900 dark:bg-white' : 'bg-black'
                            }`} />
                            {statusInfo.label}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 rounded-lg">
                            {statusTasks.length}
                          </span>
                        </div>

                        {/* Cards List */}
                        <div className="space-y-2.5 pr-0.5">
                          {statusTasks.map(task => {
                            const priorityInfo = PRIORITY_MAP[task.priority];
                            const completedCount = task.subtasks?.filter(st => st.completed).length || 0;
                            const totalSubtasks = task.subtasks?.length || 0;
                            
                            return (
                              <div
                                key={task.id}
                                onClick={() => handleSelectTask(task, 'view')}
                                className={`p-4 bg-white dark:bg-slate-900 border rounded-xl hover:shadow-md transition-all cursor-pointer relative group ${
                                  selectedTask?.id === task.id
                                    ? 'border-slate-900 ring-1 ring-slate-900 dark:border-slate-100 dark:ring-slate-100'
                                    : 'border-slate-200/60 dark:border-slate-800/60'
                                }`}
                              >
                                <div className="text-xs font-semibold leading-tight pr-5">
                                  {task.title || 'Untitled Stage'}
                                </div>

                                <div className="flex items-center gap-1 text-[9px] text-slate-400 mt-2">
                                  <Building2 className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{getClientName(task.clientId)}</span>
                                </div>

                                {/* Extra Task Details */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-3 border-t border-slate-100 dark:border-slate-800/60 pt-2.5 text-[9px] text-slate-500">
                                  {task.dueDate && (
                                    <span className="flex items-center gap-1 font-medium" title={formatDeadlineDisplay(task.dueDate, task.dueTime)}>
                                      <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                                      <span>{formatDeadlineDisplay(task.dueDate, task.dueTime)}</span>
                                    </span>
                                  )}

                                  {task.money && (
                                    <span className="font-bold text-slate-850 dark:text-slate-250 flex items-center">
                                      ₹{task.money}
                                    </span>
                                  )}

                                  {totalSubtasks > 0 && (
                                    <span className="flex items-center gap-0.5 px-1 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200/40 dark:border-slate-800/40 rounded">
                                      {completedCount}/{totalSubtasks} to-do
                                    </span>
                                  )}
                                </div>

                                {/* Footer Priority & Stage Mover */}
                                <div className="flex items-center justify-between mt-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${priorityInfo?.color}`}>
                                    {priorityInfo?.label}
                                  </span>

                                  {/* Fast Move Trigger */}
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const order: Task['status'][] = ['todo', 'in_progress', 'review', 'done'];
                                      const nextIdx = (order.indexOf(task.status) + 1) % 4;
                                      
                                      // Fast update status via API
                                      setSavingTaskField(true);
                                      try {
                                        await fetch('/api/projects/tasks', {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            id: task.id,
                                            workspaceId: activeWorkspace.id,
                                            status: order[nextIdx]
                                          })
                                        });
                                        await fetchProjects();
                                      } catch {}
                                      finally { setSavingTaskField(false); }
                                    }}
                                    className="p-1 text-slate-400 hover:text-slate-850 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-805 rounded border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all flex items-center gap-0.5 text-[9px]"
                                    title="Advance Stage"
                                  >
                                    Move <ChevronRight className="h-2.5 w-2.5" />
                                  </button>
                                </div>

                                {/* Hover Actions Group */}
                                <div 
                                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-lg p-0.5 transition-all duration-150"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => handleSelectTask(task, 'edit')}
                                    className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-202 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                                    title="Edit Details"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTask(task.id)}
                                    className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-955/20"
                                    title="Delete Card"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add inline Card */}
                        {inlineAddStatus === statusKey ? (
                          <div className="mt-3 flex flex-col gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={inlineAddTitle}
                              onChange={e => setInlineAddTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveInlineTask();
                                if (e.key === 'Escape') handleCancelInlineAdd();
                              }}
                              placeholder="Card name..."
                              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleSaveInlineTask}
                                disabled={savingInline || !inlineAddTitle.trim()}
                                className="flex-1 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-[10px] font-bold hover:opacity-90 disabled:opacity-40 transition-all"
                              >
                                {savingInline ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelInlineAdd}
                                className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold hover:opacity-80 transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenInlineAdd(statusKey)}
                            className="mt-3 w-full py-2 border border-dashed border-slate-200 hover:border-slate-800 dark:border-slate-800 dark:hover:border-slate-200/50 rounded-xl text-[10px] text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-bold transition-all text-center"
                          >
                            + New card
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}
        </div>

      </div>

      {/* Side Peek Drawer panel */}
      {selectedTask && (
        <>
          {/* Backdrop click closer */}
          <div 
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs" 
            onClick={() => setSelectedTask(null)} 
          />
          
          <div 
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePasteInDrawer}
            className="fixed top-0 right-0 h-full w-full sm:w-[480px] max-w-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-50 shadow-2xl flex flex-col overflow-hidden animate-slide-in"
          >
            {isDraggingFile && (
              <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-sm border-2 border-dashed border-slate-700 m-4 rounded-3xl pointer-events-none">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 animate-pulse">
                  <Paperclip className="h-8 w-8 text-slate-800 dark:text-slate-100 animate-bounce" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 text-center">Drop file here to attach to this stage item</p>
                </div>
              </div>
            )}
            
            {(uploadProgress || zipProgress !== null) && (
              <div className="absolute top-16 left-4 right-4 z-45 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-805 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in text-xs">
                <Loader2 className="h-4 w-4 animate-spin text-slate-900 dark:text-white" />
                <div className="flex-1 min-w-0 text-slate-850 dark:text-slate-200">
                  <div className="flex justify-between font-bold">
                    <span className="truncate">
                      {zipProgress !== null 
                        ? `Compressing folder locally: ${zipProgress}%`
                        : uploadProgress?.percent === 100 
                          ? 'Saving file on server...' 
                          : `Uploading: ${uploadProgress?.name || ''}`}
                    </span>
                    <span>{zipProgress !== null ? zipProgress : (uploadProgress?.percent ?? 0)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className={`h-full bg-indigo-650 transition-all duration-150 ${(zipProgress === 100 || uploadProgress?.percent === 100) ? 'animate-pulse' : ''}`} 
                      style={{ width: `${zipProgress !== null ? zipProgress : (uploadProgress?.percent ?? 0)}%` }} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Drawer Top Bar */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 gap-3 bg-white dark:bg-slate-900">
              {/* Stage name + budget */}
              <div className="flex-1 min-w-0">
                {drawerMode === 'view' ? (
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    {drawerTitle || 'Untitled Stage'}
                  </h2>
                ) : (
                  <input
                    type="text"
                    value={drawerTitle}
                    onChange={e => {
                      setDrawerTitle(e.target.value);
                      handleUpdateTaskField({ title: e.target.value });
                    }}
                    placeholder="Untitled Stage"
                    className="w-full text-base font-extrabold focus:outline-none bg-transparent border-b border-slate-200 dark:border-slate-700 pb-0.5 text-slate-900 dark:text-white"
                  />
                )}
                {/* Budget — shown in header, editable in edit mode */}
                {drawerMode === 'view' ? (
                  drawerMoney ? (
                    <span className="text-xl font-black text-slate-900 dark:text-white mt-2 block">
                      ₹{drawerMoney}
                      <span className="text-[9px] font-bold text-slate-400 ml-2 uppercase tracking-widest align-middle">budget</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest mt-2 block">No budget set</span>
                  )
                ) : (
                  <div className="flex items-center gap-1 mt-2">
                    <span className="text-lg font-black text-slate-500 dark:text-slate-400">₹</span>
                    <input
                      type="number"
                      value={drawerMoney}
                      onChange={e => {
                        setDrawerMoney(e.target.value);
                        handleUpdateTaskField({ money: e.target.value ? Number(e.target.value) : null });
                      }}
                      placeholder="Budget amount"
                      className="text-xl font-black bg-transparent focus:outline-none border-b border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-300 w-36"
                    />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest align-middle">budget</span>
                  </div>
                )}

              </div>



              {/* Controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                {savingTaskField && (
                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                )}
                {drawerMode === 'view' ? (
                  <button
                    onClick={() => setDrawerMode('edit')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-black dark:bg-white text-white dark:text-black rounded-lg transition-all hover:opacity-80"
                  >
                    <Edit3 className="h-3 w-3" /> Edit
                  </button>
                ) : (
                  <button
                    onClick={() => setDrawerMode('view')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg transition-all hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Eye className="h-3 w-3" /> Done
                  </button>
                )}
                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar" style={{ scrollbarWidth: 'none' }}>

              {/* Properties grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">

                {/* Status */}
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60 rounded-2xl p-3 space-y-1.5">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[8px]">Status</span>
                  {drawerMode === 'view' ? (
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {STATUS_MAP[drawerStatus]?.label || drawerStatus}
                    </div>
                  ) : (
                    <TaskStatusDropdown
                      status={drawerStatus}
                      onChange={val => {
                        setDrawerStatus(val);
                        handleUpdateTaskField({ status: val });
                      }}
                      className="w-full justify-between"
                    />
                  )}
                </div>

                {/* Priority */}
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60 rounded-2xl p-3 space-y-1.5">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[8px]">Priority</span>
                  {drawerMode === 'view' ? (
                    <div className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${PRIORITY_MAP[drawerPriority]?.color}`}>
                      {PRIORITY_MAP[drawerPriority]?.label || drawerPriority}
                    </div>
                  ) : (
                    <select
                      value={drawerPriority}
                      onChange={e => {
                        const val = e.target.value as Task['priority'];
                        setDrawerPriority(val);
                        handleUpdateTaskField({ priority: val });
                      }}
                      className="w-full bg-transparent text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200"
                    >
                      {(Object.keys(PRIORITY_MAP) as Task['priority'][]).map(k => (
                        <option key={k} value={k}>{PRIORITY_MAP[k].label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Client */}
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60 rounded-2xl p-3 space-y-1.5">
                  <span className="text-slate-400 font-bold uppercase tracking-widest text-[8px]">Client</span>
                  {drawerMode === 'view' ? (
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {getClientName(drawerClientId) || '—'}
                    </div>
                  ) : (
                    <select
                      value={drawerClientId}
                      onChange={e => {
                        const val = e.target.value;
                        setDrawerClientId(val);
                        handleUpdateTaskField({ clientId: val || null });
                      }}
                      className="w-full bg-transparent text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200"
                    >
                      <option value="">No Client</option>
                      {activeClients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                    </select>
                  )}
                </div>

                {/* Deadline */}
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60 rounded-2xl p-3 space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-bold uppercase tracking-widest text-[8px]">Deadline</span>
                    {drawerDue && (
                      <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400">
                        {drawerDueTime ? formatTime12(drawerDueTime) : 'All Day'}
                      </span>
                    )}
                  </div>
                  {drawerMode === 'view' ? (
                    <div
                      onClick={() => {
                        setDrawerMode('edit');
                      }}
                      className="cursor-pointer group space-y-1"
                      title="Click to edit deadline and time"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                          {drawerDue || '—'}
                        </span>
                        <div className="flex items-center gap-1.5 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      {drawerDue && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                          <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>{drawerDueTime ? `Due by ${formatTime12(drawerDueTime)}` : 'No specific time set (All day)'}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-0.5">
                      {/* Date Row */}
                      <div className="flex items-center justify-between gap-1.5 relative border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5">
                        <input
                          type="text"
                          value={drawerDue}
                          onChange={e => {
                            const val = e.target.value;
                            setDrawerDue(val);
                            handleUpdateTaskField({
                              dueDate: val ? (drawerDueTime ? `${val}T${drawerDueTime}` : val) : null,
                              dueTime: drawerDueTime || null
                            });
                          }}
                          placeholder="e.g. 2026-09-23"
                          className="w-full bg-transparent text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400"
                        />

                        {/* Native date input hooked to calendar icon popup */}
                        <div className="relative shrink-0 flex items-center">
                          <input
                            ref={deadlinePickerRef}
                            type="date"
                            value={drawerDue && /^\d{4}-\d{2}-\d{2}$/.test(drawerDue.trim().split('T')[0]) ? drawerDue.trim().split('T')[0] : ''}
                            onChange={e => {
                              const val = e.target.value;
                              setDrawerDue(val);
                              handleUpdateTaskField({
                                dueDate: val ? (drawerDueTime ? `${val}T${drawerDueTime}` : val) : null,
                                dueTime: drawerDueTime || null
                              });
                            }}
                            className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (deadlinePickerRef.current) {
                                try { (deadlinePickerRef.current as any).showPicker(); } catch { deadlinePickerRef.current.click(); }
                              }
                            }}
                            className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0"
                            title="Open calendar to pick date"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Time Row */}
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <input
                            type="time"
                            value={drawerDueTime}
                            onChange={e => {
                              const timeVal = e.target.value;
                              setDrawerDueTime(timeVal);
                              handleUpdateTaskField({
                                dueDate: drawerDue ? (timeVal ? `${drawerDue}T${timeVal}` : drawerDue) : null,
                                dueTime: timeVal || null
                              });
                            }}
                            className="w-full bg-transparent text-xs font-semibold focus:outline-none text-slate-800 dark:text-slate-200"
                          />
                        </div>

                        {drawerDueTime ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerDueTime('');
                              handleUpdateTaskField({
                                dueDate: drawerDue || null,
                                dueTime: null
                              });
                            }}
                            className="text-[9px] font-bold text-slate-400 hover:text-rose-500 px-1 transition-colors"
                            title="Clear time"
                          >
                            Clear
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic">No time</span>
                        )}
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                        {[
                          { label: '12 PM', val: '12:00' },
                          { label: '5 PM', val: '17:00' },
                          { label: '6 PM', val: '18:00' },
                          { label: '11:59 PM', val: '23:59' }
                        ].map(preset => (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => {
                              setDrawerDueTime(preset.val);
                              handleUpdateTaskField({
                                dueDate: drawerDue ? `${drawerDue}T${preset.val}` : null,
                                dueTime: preset.val
                              });
                            }}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition-all ${
                              drawerDueTime === preset.val
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-350 hover:bg-slate-300 dark:hover:bg-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>


              {/* Info section */}
              <div className="space-y-2">
                <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Info</h3>

                {drawerMode === 'view' ? (
                  <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">
                    {renderTextWithLinks(drawerDesc)}
                  </p>
                ) : (
                  <textarea
                    value={drawerDesc}
                    onChange={e => {
                      setDrawerDesc(e.target.value);
                      handleUpdateTaskField({ description: e.target.value });
                    }}
                    placeholder="Provide an overview of the project's goals and context..."
                    rows={4}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-805 rounded-xl text-xs focus:outline-none resize-none leading-relaxed"
                  />
                )}
              </div>

              {/* Action Items Checklist */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Action items</h3>
                
                <div className="space-y-2">
                  {(selectedTask.subtasks || []).map(st => (
                    <div key={st.id} className="flex items-center justify-between group/subtask p-1.5 hover:bg-slate-50 dark:hover:bg-slate-955 rounded-xl text-xs">
                      <label className={`flex items-center gap-2.5 select-none ${drawerMode === 'view' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={st.completed}
                          disabled={drawerMode === 'view'}
                          onChange={() => handleToggleSubtask(st.id, st.completed)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:ring-offset-0 dark:bg-slate-955 dark:border-slate-800 disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                        <span className={`${st.completed ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {st.title}
                        </span>
                      </label>
                      
                      {drawerMode === 'edit' && (
                        <button
                          onClick={() => handleDeleteSubtask(st.id)}
                          className="opacity-0 group-hover/subtask:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded"
                          title="Delete Action Item"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {drawerMode === 'edit' && (
                  <form onSubmit={handleAddSubtask} className="flex gap-2">
                    <input
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      placeholder="Add a to-do item..."
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all"
                    >
                      Add
                    </button>
                  </form>
                )}
              </div>

              {/* Files & Attachments Section */}
              <div className="space-y-3 border-t border-slate-150/40 dark:border-slate-800/40 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Attachments
                  </h3>
                  
                  {drawerMode === 'edit' && (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-all">
                        <Plus className="h-3 w-3" /> Upload File
                        <input
                          type="file"
                          className="hidden"
                          onChange={handleLocalFileUpload}
                        />
                      </label>

                      <button
                        onClick={() => {
                          setShowChatFilesDropdown(!showChatFilesDropdown);
                          if (!showChatFilesDropdown) loadChatAttachments();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-955/45 dark:hover:bg-indigo-900/40 text-indigo-650 dark:text-indigo-400 rounded-lg transition-all"
                      >
                        <MessageSquare className="h-3 w-3" /> Link Chat File
                      </button>
                    </div>
                  )}
                </div>

                {showChatFilesDropdown && drawerMode === 'edit' && (
                  <div className="bg-slate-50 dark:bg-slate-955 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 max-h-40 overflow-y-auto">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Available files from chats:</p>
                    {fetchingChats ? (
                      <div className="flex items-center gap-1.5 py-1 text-[10px] text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching...
                      </div>
                    ) : chatAttachments.length === 0 ? (
                      <p className="text-[10px] text-slate-400 py-1">No files found in workspace chats</p>
                    ) : (
                      <div className="space-y-1">
                        {chatAttachments.map((file, idx) => {
                          const isAttached = (selectedTask.attachments || []).some(att => att.url === file.url);
                          return (
                            <button
                              key={idx}
                              disabled={isAttached}
                              onClick={() => {
                                const newAtt = {
                                  id: file.id || Math.random().toString(),
                                  name: file.name,
                                  url: file.url,
                                  size: file.size,
                                  mimeType: file.mimeType
                                };
                                const updated = [...(selectedTask.attachments || []), newAtt];
                                handleUpdateTaskField({ attachments: updated });
                                setSelectedTask(prev => prev ? { ...prev, attachments: updated } : null);
                              }}
                              className="w-full text-left p-1.5 hover:bg-white dark:hover:bg-slate-900 rounded-lg flex items-center justify-between text-[10px] transition-all disabled:opacity-40"
                            >
                              <span className="truncate pr-2 font-medium text-slate-700 dark:text-slate-355">{file.name}</span>
                              <span className="text-[8px] text-slate-400 shrink-0">{file.chatName}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {(selectedTask.attachments || []).length === 0 ? (
                    <p className="text-[10px] text-slate-450 dark:text-slate-500 italic">No attachments linked to this stage item.</p>
                  ) : (
                    (selectedTask.attachments || []).map((file, idx) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-955/30 p-2.5 rounded-xl border border-slate-150/30 dark:border-slate-850 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            {downloadProgresses[file.id] !== undefined ? (
                              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 animate-pulse block">
                                Downloading: {downloadProgresses[file.id]}%
                              </span>
                            ) : (
                              <span className="font-bold text-slate-700 dark:text-slate-200 truncate block text-left">
                                {file.name}
                              </span>
                            )}
                            <span className="text-[8px] text-slate-400 block mt-0.5">{(file.size / 1024).toFixed(1)} KB • {file.mimeType}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {/* View button — opens file in new tab */}
                          <button
                            onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                            className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                            title="View / Preview file"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* Download button */}
                          {downloadProgresses[file.id] === undefined && (
                            <button
                              onClick={() => triggerFileDownload(file.url, file.name, file.id)}
                              draggable
                              onDragStart={(e) => handleDragStart(e, file)}
                              className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                              title="Download file"
                            >
                              <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                            </button>
                          )}

                          {/* Remove (edit mode only) */}
                          {drawerMode === 'edit' && (
                            <button
                              onClick={() => {
                                const updated = (selectedTask.attachments || []).filter((_, i) => i !== idx);
                                handleUpdateTaskField({ attachments: updated });
                                setSelectedTask(prev => prev ? { ...prev, attachments: updated } : null);
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-955/20 rounded-lg transition-all"
                              title="Remove attachment"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                    ))
                  )}
                </div>
              </div>

              {/* Comments Section */}
              <div className="space-y-3 border-t border-slate-150/40 dark:border-slate-800/40 pt-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> Comments
                </h3>
                
                <div className="space-y-3.5">
                  {(selectedTask.comments || []).map(comment => (
                    <div key={comment.id} className="bg-slate-50 dark:bg-slate-955/40 p-3 rounded-2xl border border-slate-150/30 dark:border-slate-850 text-xs">
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold mb-1.5">
                        <span>{comment.senderName}</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="leading-relaxed text-slate-755 dark:text-slate-300">{comment.content}</p>
                    </div>
                  ))}
                </div>

                {drawerMode === 'edit' && (
                  <form onSubmit={handleAddComment} className="flex flex-col gap-2">
                    <textarea
                      value={newCommentText}
                      onChange={e => setNewCommentText(e.target.value)}
                      placeholder="Add a comment..."
                      rows={2}
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none resize-none leading-relaxed"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all"
                      >
                        Post
                      </button>
                    </div>
                  </form>
                )}
              </div>

            </div>

          </div>
        </>
      )}

      {/* Project Form Modal */}
      {showAddProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddProject(false); }}
        >
          <div className="w-full max-w-sm max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {editingProject ? 'Edit Project' : 'Create New Project'}
              </h3>
              <button
                onClick={() => setShowAddProject(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleSaveProject} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Project Name
                </label>
                <input
                  required
                  type="text"
                  value={projName}
                  onChange={e => setProjName(e.target.value)}
                  placeholder="e.g. Project B2C"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Business Type
                </label>
                <select
                  value={projBusinessType}
                  onChange={e => setProjBusinessType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none"
                >
                  <option value="B2B">B2B (Business to Business)</option>
                  <option value="B2C">B2C (Business to Consumer)</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="SaaS">SaaS</option>
                  <option value="Agency">Agency</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  value={projDesc}
                  onChange={e => setProjDesc(e.target.value)}
                  placeholder="Goals or general info..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={projStatus}
                  onChange={e => setProjStatus(e.target.value as Project['status'])}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none"
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddProject(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-955"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingProj}
                  className="px-4 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {creatingProj ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingUpload && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setPendingUpload(null); }}
        >
          <div className="w-full max-w-sm max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 rounded-3xl shadow-2xl p-6 flex flex-col gap-4 text-xs animate-scale-in text-slate-800 dark:text-slate-200 overflow-y-auto">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-955/40 rounded-xl flex items-center justify-center text-indigo-650 dark:text-indigo-400 shrink-0">
                <Paperclip className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Confirm Upload</h3>
                <p className="text-slate-400 text-[10px] mt-0.5">Please review the details below before uploading</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-955/20 border border-slate-200/40 dark:border-slate-805 p-3 rounded-2xl space-y-2">
              <div className="min-w-0">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Name</p>
                <p className="font-bold text-slate-850 dark:text-slate-200 truncate mt-0.5 text-xs">{pendingUpload.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Type</p>
                  <p className="font-bold text-slate-700 dark:text-slate-350 mt-0.5">{pendingUpload.isFolder ? 'Folder (Server-Side Zipping)' : 'File'}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Size</p>
                  <p className="font-bold text-slate-700 dark:text-slate-355 mt-0.5">
                    {formatBytes(pendingUpload.files.reduce((sum, item) => sum + item.file.size, 0))}
                  </p>
                </div>
              </div>
              {pendingUpload.files.length > 1 && (
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Files Count</p>
                  <p className="font-semibold text-slate-750 dark:text-slate-350 mt-0.5">{pendingUpload.files.length} items</p>
                </div>
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setPendingUpload(null)}
                className="flex-1 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-xl transition-all font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executePendingUpload}
                className="flex-1 py-2.5 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl transition-all font-black"
              >
                Upload & Attach
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
