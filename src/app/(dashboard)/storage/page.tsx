'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { 
  Folder, 
  FolderPlus,
  File, 
  Search, 
  Plus, 
  Save, 
  Trash2, 
  X, 
  Loader2, 
  Download, 
  Database,
  HardDrive,
  ShieldAlert,
  CheckCircle,
  AlertCircle,
  FileCode,
  FileText,
  Building2,
  FolderKanban,
  FileImage,
  FileAudio,
  FileVideo,
  Play,
  Volume2,
  Edit3,
  Users,
  Server,
  Shield,
  Layers,
  Calendar,
  Cpu,
  Check,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Zap
} from 'lucide-react';

const CLOUDFLARE_R2_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB Free Tier (Cloudflare R2)

const SYSTEM_CATEGORY_NAMES = new Set([
  'sessions',
  'logs',
  'settings',
  'backups',
  'temp_uploads',
  'analytics',
  'memory',
  'users',
  'workspaces',
  'notifications',
]);

const isSystemCategory = (name: string): boolean => {
  const lower = name.toLowerCase();
  if (SYSTEM_CATEGORY_NAMES.has(lower)) return true;
  if (lower.startsWith('sys') || lower.includes('log') || lower.includes('cache') || lower.includes('session') || lower.includes('backup')) {
    return true;
  }
  return false;
};

interface StorageCategory {
  name: string;
  path: string;
  sizeBytes: number;
  fileCount: number;
}

interface StorageFile {
  name: string;
  sizeBytes: number;
  updatedAt: string;
  isFile: boolean;
  category: string; // which folder it lives in: e.g. 'uploads'
}

interface ClientInfo {
  id: string;
  companyName: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  clientId: string | null;
}

type GroupByMode = 'directory' | 'client' | 'project' | 'type';

export default function StoragePage() {
  const { user } = useAuth();
  const { activeWorkspace, currentMember, getTabAccess } = useWorkspace();
  
  // Grouping Mode
  const [groupByMode, setGroupByMode] = useState<GroupByMode>('directory');
  const [activeLayerFilter, setActiveLayerFilter] = useState<'all' | 'team' | 'system'>('all');

  // Data lists from API
  const [categories, setCategories] = useState<StorageCategory[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [metadata, setMetadata] = useState<Record<string, { clientId?: string; projectId?: string; description?: string }>>({});

  // Segregate categories into Team vs System layers
  const { teamCategories, systemCategories, teamTotalSize, systemTotalSize, teamFileCount, systemFileCount } = useMemo(() => {
    const team: StorageCategory[] = [];
    const sys: StorageCategory[] = [];
    let tSize = 0;
    let sSize = 0;
    let tFiles = 0;
    let sFiles = 0;

    categories.forEach(cat => {
      if (isSystemCategory(cat.name)) {
        sys.push(cat);
        sSize += cat.sizeBytes;
        sFiles += cat.fileCount;
      } else {
        team.push(cat);
        tSize += cat.sizeBytes;
        tFiles += cat.fileCount;
      }
    });

    team.sort((a, b) => b.sizeBytes - a.sizeBytes);
    sys.sort((a, b) => b.sizeBytes - a.sizeBytes);

    return {
      teamCategories: team,
      systemCategories: sys,
      teamTotalSize: tSize,
      systemTotalSize: sSize,
      teamFileCount: tFiles,
      systemFileCount: sFiles,
    };
  }, [categories]);

  const getCategoryIcon = (name: string, isSystem: boolean) => {
    const lower = name.toLowerCase();
    if (lower === 'avatars') return <FileImage className="h-3.5 w-3.5 text-pink-500 shrink-0" />;
    if (lower === 'messages' || lower === 'conversations' || lower === 'groups') return <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />;
    if (lower === 'projects' || lower === 'tasks' || lower === 'boards') return <FolderKanban className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    if (lower === 'calendar' || lower === 'events') return <Calendar className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    if (lower === 'clients' || lower === 'leads' || lower === 'crm') return <Building2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
    if (lower === 'invoices' || lower === 'payments' || lower === 'contracts') return <FileText className="h-3.5 w-3.5 text-purple-500 shrink-0" />;
    if (lower === 'uploads' || lower === 'attachments' || lower === 'documents') return <Folder className="h-3.5 w-3.5 text-sky-500 shrink-0" />;
    if (lower === 'sessions') return <Shield className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
    if (lower === 'logs') return <FileCode className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    if (lower === 'settings') return <HardDrive className="h-3.5 w-3.5 text-slate-500 shrink-0" />;
    if (lower === 'backups') return <Database className="h-3.5 w-3.5 text-cyan-500 shrink-0" />;
    if (lower === 'analytics') return <Layers className="h-3.5 w-3.5 text-teal-500 shrink-0" />;
    if (isSystem) return <Server className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    return <Folder className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
  };
  
  // All files cache (for non-directory views)
  const [allFiles, setAllFiles] = useState<StorageFile[]>([]);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loadingAllFiles, setLoadingAllFiles] = useState(false);

  // Active selections & mobile drilldown view
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileCategory, setSelectedFileCategory] = useState<string | null>(null); // e.g. 'uploads'
  const [currentSubpath, setCurrentSubpath] = useState<string>('');
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);
  const [mobileStorageView, setMobileStorageView] = useState<'groups' | 'files' | 'preview'>('groups');
  
  // Content & metadata states
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  
  // Linked values for file metadata editing
  const [linkedClientId, setLinkedClientId] = useState<string>('');
  const [linkedProjectId, setLinkedProjectId] = useState<string>('');
  const [savingMetadata, setSavingMetadata] = useState(false);

  // Search & Loading
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [deletingFile, setDeletingFile] = useState(false);
  const [cleaningTemp, setCleaningTemp] = useState(false);
  
  // New File Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTargetName, setRenameTargetName] = useState('');
  const [newTargetNameInput, setNewTargetNameInput] = useState('');
  const [isFolderRename, setIsFolderRename] = useState(false);

  // 1. Fetch categories, clients, projects, metadata
  const fetchDataCenter = async () => {
    setLoadingCategories(true);
    try {
      const url = activeWorkspace?.id 
        ? `/api/admin/explorer?workspaceId=${encodeURIComponent(activeWorkspace.id)}` 
        : '/api/admin/explorer';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setClients(data.clients || []);
        setProjects(data.projects || []);
        setMetadata(data.metadata || {});
      }
    } catch (err) {
      console.error('Failed to load storage categories', err);
    } finally {
      setLoadingCategories(false);
    }
  };

  // Helper to fetch files across key folders (uploads, avatars, attachments)
  const fetchAllFilesList = async () => {
    setLoadingAllFiles(true);
    try {
      const dirs = ['uploads', 'avatars', 'attachments'];
      const results = await Promise.all(
        dirs.map(async (dir) => {
          try {
            const res = await fetch(`/api/admin/explorer?category=${dir}`);
            if (res.ok) {
              const data = await res.json();
              return (data.files || []).map((f: any) => ({ ...f, category: dir }));
            }
          } catch {}
          return [];
        })
      );
      setAllFiles(results.flat());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAllFiles(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDataCenter();
    }
  }, [user, activeWorkspace?.id]);

  // Load all files list when switching to non-directory view
  useEffect(() => {
    if (groupByMode !== 'directory' && user) {
      fetchAllFilesList();
    }
  }, [groupByMode, user]);

  // Handle Escape key to exit modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreateFolderModal(false);
        setShowCreateModal(false);
        setShowRenameModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Total space calculation
  const totalSizeBytes = useMemo(() => {
    return categories.reduce((sum, cat) => sum + cat.sizeBytes, 0);
  }, [categories]);

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Clean filename helper (strips timestamp and uuid prefix)
  const cleanFileName = (fullName: string) => {
    const baseName = fullName.split('/').pop() || fullName;
    const parts = baseName.split('_');
    if (parts.length > 2) {
      const isTimestamp = /^\d{10,13}$/.test(parts[0]);
      const isUuid = parts[1].length === 36 || parts[1].includes('-');
      if (isTimestamp && isUuid) {
        return parts.slice(2).join('_');
      }
    }
    return baseName;
  };

  // Detect file preview type
  const getFilePreviewType = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext) return 'text';
    
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      return 'image';
    }
    if (['webm', 'mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
      // If webm screen recording or audio memo
      if (fileName.includes('voice-memo') || fileName.includes('voice_memo') || ext !== 'webm') {
        return 'audio';
      }
      return 'video'; // generic webm defaults to video if not matching voice memo
    }
    if (['mp4', 'mov', 'm4v'].includes(ext)) {
      return 'video';
    }
    if (ext === 'pdf') {
      return 'pdf';
    }
    
    // Check if it is a text-editable format
    if (['json', 'txt', 'log', 'js', 'ts', 'html', 'css', 'md', 'xml'].includes(ext)) {
      return 'text';
    }
    return 'unknown';
  };

  // Fetch files in directory view
  const fetchDirectoryFiles = async (catName: string, subpath: string = '') => {
    setLoadingFiles(true);
    try {
      const url = subpath
        ? `/api/admin/explorer?category=${catName}&subpath=${encodeURIComponent(subpath)}`
        : `/api/admin/explorer?category=${catName}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setFiles((data.files || []).map((f: any) => ({
          ...f,
          category: catName,
          name: subpath ? `${subpath}/${f.name}` : f.name
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFiles(false);
    }
  };

  // Select Group (e.g. click a category, client, project, or file type in the sidebar)
  const handleSelectGroup = (key: string) => {
    setSelectedGroupKey(key);
    setSelectedFile(null);
    setSelectedFileCategory(null);
    setFileContent('');
    setOriginalContent('');
    setJsonError(null);
    setCurrentSubpath('');
    setMobileStorageView('files');
    
    if (groupByMode === 'directory') {
      fetchDirectoryFiles(key, '');
    }
  };

  // Filter files belonging to selected group under current grouping mode
  const groupFilteredFiles = useMemo(() => {
    if (!selectedGroupKey) return [];
    
    let baseList: StorageFile[] = [];
    if (groupByMode === 'directory') {
      baseList = files;
    } else {
      baseList = allFiles;
    }

    let filtered = baseList;
    if (groupByMode === 'client') {
      filtered = baseList.filter(f => {
        const fileKey = `${f.category}/${f.name}`;
        const meta = metadata[fileKey];
        if (selectedGroupKey === 'unassigned') {
          return !meta?.clientId;
        }
        return meta?.clientId === selectedGroupKey;
      });
    } else if (groupByMode === 'project') {
      filtered = baseList.filter(f => {
        const fileKey = `${f.category}/${f.name}`;
        const meta = metadata[fileKey];
        if (selectedGroupKey === 'unassigned') {
          return !meta?.projectId;
        }
        return meta?.projectId === selectedGroupKey;
      });
    } else if (groupByMode === 'type') {
      filtered = baseList.filter(f => {
        const type = getFilePreviewType(f.name);
        return type === selectedGroupKey;
      });
    }

    // Filter by search query
    return filtered.filter(f => {
      const cleanName = cleanFileName(f.name);
      return (
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cleanName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [groupByMode, selectedGroupKey, files, allFiles, metadata, searchQuery]);

  // Sidebar Group List builder
  const groupSidebarItems = useMemo(() => {
    if (groupByMode === 'directory') {
      return categories.map(cat => ({
        key: cat.name,
        label: cat.name,
        path: `./storage/${cat.name}`,
        fileCount: cat.fileCount,
        sizeBytes: cat.sizeBytes,
        icon: <Folder className="h-3.5 w-3.5 text-slate-400" />
      }));
    }

    if (groupByMode === 'client') {
      const groupedCounts: Record<string, { count: number; size: number }> = {};
      allFiles.forEach(f => {
        const fileKey = `${f.category}/${f.name}`;
        const clientId = metadata[fileKey]?.clientId || 'unassigned';
        if (!groupedCounts[clientId]) {
          groupedCounts[clientId] = { count: 0, size: 0 };
        }
        groupedCounts[clientId].count++;
        groupedCounts[clientId].size += f.sizeBytes;
      });

      const list = clients.map(c => ({
        key: c.id,
        label: c.companyName,
        path: `Client Account`,
        fileCount: groupedCounts[c.id]?.count || 0,
        sizeBytes: groupedCounts[c.id]?.size || 0,
        icon: <Building2 className="h-3.5 w-3.5 text-slate-400" />
      }));

      // Add unassigned
      list.push({
        key: 'unassigned',
        label: 'Unassigned Files',
        path: 'No client associated',
        fileCount: groupedCounts['unassigned']?.count || 0,
        sizeBytes: groupedCounts['unassigned']?.size || 0,
        icon: <Folder className="h-3.5 w-3.5 text-slate-400" />
      });
      return list;
    }

    if (groupByMode === 'project') {
      const groupedCounts: Record<string, { count: number; size: number }> = {};
      allFiles.forEach(f => {
        const fileKey = `${f.category}/${f.name}`;
        const projectId = metadata[fileKey]?.projectId || 'unassigned';
        if (!groupedCounts[projectId]) {
          groupedCounts[projectId] = { count: 0, size: 0 };
        }
        groupedCounts[projectId].count++;
        groupedCounts[projectId].size += f.sizeBytes;
      });

      const list = projects.map(p => ({
        key: p.id,
        label: p.name,
        path: `Project Drive`,
        fileCount: groupedCounts[p.id]?.count || 0,
        sizeBytes: groupedCounts[p.id]?.size || 0,
        icon: <FolderKanban className="h-3.5 w-3.5 text-slate-400" />
      }));

      // Add unassigned
      list.push({
        key: 'unassigned',
        label: 'Unassigned Files',
        path: 'No project associated',
        fileCount: groupedCounts['unassigned']?.count || 0,
        sizeBytes: groupedCounts['unassigned']?.size || 0,
        icon: <Folder className="h-3.5 w-3.5 text-slate-400" />
      });
      return list;
    }

    if (groupByMode === 'type') {
      const groupedCounts: Record<string, { count: number; size: number }> = {
        image: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
        video: { count: 0, size: 0 },
        pdf: { count: 0, size: 0 },
        text: { count: 0, size: 0 },
        unknown: { count: 0, size: 0 }
      };

      allFiles.forEach(f => {
        const type = getFilePreviewType(f.name);
        groupedCounts[type].count++;
        groupedCounts[type].size += f.sizeBytes;
      });

      return [
        { key: 'image', label: 'Images', path: 'Photos, Graphics, Screens', fileCount: groupedCounts.image.count, sizeBytes: groupedCounts.image.size, icon: <FileImage className="h-3.5 w-3.5 text-slate-400" /> },
        { key: 'audio', label: 'Audio / Voice Memos', path: 'Recordings, Music, Notes', fileCount: groupedCounts.audio.count, sizeBytes: groupedCounts.audio.size, icon: <FileAudio className="h-3.5 w-3.5 text-slate-400" /> },
        { key: 'video', label: 'Videos', path: 'Clips, Screen Records', fileCount: groupedCounts.video.count, sizeBytes: groupedCounts.video.size, icon: <FileVideo className="h-3.5 w-3.5 text-slate-400" /> },
        { key: 'pdf', label: 'PDF Documents', path: 'Reports, Invoices, Briefs', fileCount: groupedCounts.pdf.count, sizeBytes: groupedCounts.pdf.size, icon: <FileText className="h-3.5 w-3.5 text-slate-400" /> },
        { key: 'text', label: 'Database & Text Code', path: 'JSON db, logs, plain text', fileCount: groupedCounts.text.count, sizeBytes: groupedCounts.text.size, icon: <FileCode className="h-3.5 w-3.5 text-slate-400" /> },
        { key: 'unknown', label: 'Other Binaries', path: 'Unrecognized formats', fileCount: groupedCounts.unknown.count, sizeBytes: groupedCounts.unknown.size, icon: <File className="h-3.5 w-3.5 text-slate-400" /> }
      ];
    }

    return [];
  }, [groupByMode, categories, clients, projects, allFiles, metadata]);

  // Fetch file content & link states
  const handleSelectFile = async (file: StorageFile) => {
    setSelectedFile(file.name);
    const cat = file.category || (groupByMode === 'directory' ? selectedGroupKey : 'uploads') || 'uploads';
    setSelectedFileCategory(cat);
    setFileSizeBytes(file.sizeBytes);
    setLoadingContent(true);
    setJsonError(null);
    setImageError(false);
    setMobileStorageView('preview');
    
    // Set linked values
    const fileKey = `${cat}/${file.name}`;
    const fileMeta = metadata[fileKey] || {};
    setLinkedClientId(fileMeta.clientId || '');
    setLinkedProjectId(fileMeta.projectId || '');

    const type = getFilePreviewType(file.name);

    if (type === 'text') {
      try {
        const res = await fetch(`/api/admin/explorer?category=${encodeURIComponent(cat)}&file=${encodeURIComponent(file.name)}`);
        if (res.ok) {
          const data = await res.json();
          const content = data.content || '';
          setFileContent(content);
          setOriginalContent(content);
          
          if (file.name.endsWith('.json')) {
            try {
              JSON.parse(content);
            } catch (e: any) {
              setJsonError(e.message);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load text file content', err);
      } finally {
        setLoadingContent(false);
      }
    } else {
      // Binary files don't need text fetch
      setFileContent('');
      setOriginalContent('');
      setLoadingContent(false);
    }
  };

  // Previewable files for navigation / pagination
  const previewableFiles = useMemo(() => {
    return groupFilteredFiles.filter(f => f.isFile !== false);
  }, [groupFilteredFiles]);

  const currentFileIndex = useMemo(() => {
    if (!selectedFile) return -1;
    return previewableFiles.findIndex(f => f.name === selectedFile);
  }, [previewableFiles, selectedFile]);

  const handlePrevFile = () => {
    if (currentFileIndex > 0) {
      handleSelectFile(previewableFiles[currentFileIndex - 1]);
    }
  };

  const handleNextFile = () => {
    if (currentFileIndex >= 0 && currentFileIndex < previewableFiles.length - 1) {
      handleSelectFile(previewableFiles[currentFileIndex + 1]);
    }
  };

  // Validate and parse JSON content edits
  const handleContentChange = (val: string) => {
    setFileContent(val);
    if (selectedFile?.endsWith('.json')) {
      try {
        JSON.parse(val);
        setJsonError(null);
      } catch (e: any) {
        setJsonError(e.message);
      }
    } else {
      setJsonError(null);
    }
  };

  // Save Text/JSON changes
  const saveChanges = async () => {
    if (!selectedFileCategory || !selectedFile) return;
    if (jsonError) {
      alert('Cannot save: Invalid JSON structure.');
      return;
    }
    setSavingFile(true);
    try {
      const res = await fetch(`/api/admin/explorer?category=${selectedFileCategory}&file=${selectedFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileContent })
      });
      if (res.ok) {
        setOriginalContent(fileContent);
        fetchDataCenter();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save changes');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingFile(false);
    }
  };

  // Save Link Metadata Changes
  const saveMetadataLinkages = async (clientVal: string, projectVal: string) => {
    if (!selectedFileCategory || !selectedFile) return;
    setSavingMetadata(true);
    try {
      const fileKey = `${selectedFileCategory}/${selectedFile}`;
      const newMetaMap = {
        ...metadata,
        [fileKey]: {
          clientId: clientVal || undefined,
          projectId: projectVal || undefined,
          updatedAt: new Date().toISOString()
        }
      };

      const res = await fetch('/api/admin/explorer?action=metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: newMetaMap })
      });

      if (res.ok) {
        setMetadata(newMetaMap);
        // Refresh listings in case we are in client/project grouping view
        if (groupByMode !== 'directory') {
          await fetchAllFilesList();
        }
        fetchDataCenter();
      } else {
        alert('Failed to save metadata links');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingMetadata(false);
    }
  };

  // Delete File
  const deleteFile = async () => {
    if (!selectedFileCategory || !selectedFile) return;
    if (!confirm(`Are you absolutely sure you want to delete ${selectedFile}? This modifies database files directly.`)) return;
    setDeletingFile(true);
    try {
      const res = await fetch(`/api/admin/explorer?category=${selectedFileCategory}&file=${selectedFile}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSelectedFile(null);
        setFileContent('');
        setOriginalContent('');
        setJsonError(null);
        
        // Refresh listings
        if (groupByMode === 'directory') {
          fetchDirectoryFiles(selectedFileCategory);
        } else {
          await fetchAllFilesList();
        }
        fetchDataCenter();
      } else {
        alert('Failed to delete file');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingFile(false);
    }
  };

  // Create New File
  const createNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupKey || !newFileName.trim()) return;
    
    let finalName = newFileName.trim();
    if (!finalName.includes('.')) {
      finalName += '.json';
    }
    const fullPath = currentSubpath ? `${currentSubpath}/${finalName}` : finalName;
    
    setSavingFile(true);
    try {
      const initialPayload = newFileContent.trim() || (finalName.endsWith('.json') ? '{}' : '');
      const res = await fetch(`/api/admin/explorer?category=${selectedGroupKey}&file=${encodeURIComponent(fullPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: initialPayload })
      });
      if (res.ok) {
        setNewFileName('');
        setNewFileContent('');
        setShowCreateModal(false);
        await fetchDirectoryFiles(selectedGroupKey, currentSubpath);
        handleSelectFile({
          name: fullPath,
          sizeBytes: initialPayload.length,
          updatedAt: new Date().toISOString(),
          isFile: true,
          category: selectedGroupKey
        });
        fetchDataCenter();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create file');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingFile(false);
    }
  };

  // Create New Folder
  const createNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupKey || !newFolderName.trim()) return;

    setSavingFile(true);
    try {
      const res = await fetch(`/api/admin/explorer?category=${selectedGroupKey}&action=create_folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          subpath: currentSubpath
        })
      });
      if (res.ok) {
        setNewFolderName('');
        setShowCreateFolderModal(false);
        await fetchDirectoryFiles(selectedGroupKey, currentSubpath);
        fetchDataCenter();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create folder');
      }
    } catch {
      alert('Network error');
    } finally {
      setSavingFile(false);
    }
  };

  // Rename File or Folder
  const renameFileOrFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupKey || !renameTargetName || !newTargetNameInput.trim()) return;

    setSavingFile(true);
    try {
      const res = await fetch('/api/admin/explorer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedGroupKey,
          file: renameTargetName,
          newName: newTargetNameInput.trim()
        })
      });
      if (res.ok) {
        setShowRenameModal(false);
        setNewTargetNameInput('');
        
        await fetchDirectoryFiles(selectedGroupKey, currentSubpath);
        fetchDataCenter();

        if (selectedFile === renameTargetName) {
          setSelectedFile(newTargetNameInput.trim());
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to rename');
      }
    } catch {
      alert('Network error');
    } finally {
      setSavingFile(false);
    }
  };

  // Download File
  const downloadFile = () => {
    if (!selectedFile || !selectedFileCategory) return;
    const url = `/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanFileName(selectedFile);
    a.click();
  };

  // Clean / Purge Temp Uploads
  const handleCleanTempUploads = async () => {
    if (!confirm('Purge all temporary scratch files and abandoned chunks in temp_uploads?')) return;
    setCleaningTemp(true);
    try {
      const res = await fetch('/api/admin/explorer?category=temp_uploads&action=clean_temp&forceAll=true', {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        await fetchDirectoryFiles('temp_uploads', '');
        fetchDataCenter();
        alert(`Cleanup complete: Removed ${data.cleanedCount || 0} temporary scratch items (${formatBytes(data.reclaimedBytes || 0)} reclaimed).`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to clean temp uploads');
    } finally {
      setCleaningTemp(false);
    }
  };

  // Pre-calculate visible projects for currently selected client links
  const visibleProjects = useMemo(() => {
    if (!linkedClientId) return projects;
    return projects.filter(p => p.clientId === linkedClientId);
  }, [projects, linkedClientId]);

  // Storage Access Page Guard
  const isWorkspaceOwner = !!(activeWorkspace && user && activeWorkspace.ownerId === user.id);
  const currentMemberRole = currentMember?.role;
  const storageAccess = getTabAccess('storage');
  const hasAccess = user?.role === 'admin' || isWorkspaceOwner || currentMemberRole === 'manager' || storageAccess !== 'none';

  if (!hasAccess) {
    return (
      <div className="flex h-full items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="text-center max-w-sm bg-white dark:bg-slate-900 p-8 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
          <ShieldAlert className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Storage Access Required</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            You do not have access to view or manage Storage files in this workspace. Please contact your workspace administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 md:p-8 min-h-full lg:h-[calc(100vh-4rem)] flex flex-col gap-4 sm:gap-6 max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden text-slate-800 dark:text-slate-200 pb-12 lg:pb-0">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0 gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-slate-800 dark:text-slate-100" />
            Data Center
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            App Storage Explorer, File Previews, & Dynamic Database Segregation
          </p>
        </div>
        
        {/* Toggle Mode Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200/50 dark:border-slate-800/50 rounded-xl overflow-x-auto no-scrollbar">
            {(['directory', 'client', 'project', 'type'] as GroupByMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => {
                  setGroupByMode(mode);
                  setSelectedGroupKey(null);
                  setSelectedFile(null);
                  setSelectedFileCategory(null);
                  setMobileStorageView('groups');
                }}
                className={`px-2 sm:px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all shrink-0 ${
                  groupByMode === mode
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-orange-50/80 dark:bg-orange-950/40 px-2.5 sm:px-3 py-1.5 border border-orange-200/70 dark:border-orange-800/50 rounded-xl shrink-0">
            <Cloud className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <span className="text-[10px] font-bold whitespace-nowrap text-slate-800 dark:text-slate-200">
              <span className="hidden sm:inline">Cloudflare Quota: </span>
              <span className="sm:hidden">R2: </span>
              {formatBytes(totalSizeBytes)} <span className="text-slate-400 font-normal">/ 10 GB</span>
              <span className="ml-1 text-[9px] text-orange-600 dark:text-orange-400 font-semibold">({((totalSizeBytes / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(1)}%)</span>
            </span>
          </div>
        </div>
      </div>

      {/* CLOUDFLARE R2 & FIRESTORE CLOUD INFRASTRUCTURE BANNER */}
      <div className="bg-gradient-to-r from-orange-500/[0.07] via-amber-500/[0.05] to-indigo-500/[0.05] dark:from-orange-950/30 dark:via-slate-900/40 dark:to-indigo-950/20 border border-orange-200/80 dark:border-orange-900/40 rounded-2xl p-3.5 sm:p-4 shrink-0 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-orange-100 dark:bg-orange-950/80 border border-orange-200 dark:border-orange-800/60 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
              <Cloud className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Cloudflare R2 + Google Firestore Cloud Storage
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 text-[9px] font-black uppercase tracking-wider">
                  10 GB Free Tier
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold">
                  Zero Egress Fees
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Global edge media storage with 10 GB quota, 1M Class A writes, 10M Class B reads, and Firestore document store
              </p>
            </div>
          </div>

          <div className="flex items-baseline sm:text-right gap-1.5 shrink-0">
            <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              {formatBytes(totalSizeBytes)}
            </span>
            <span className="text-xs font-semibold text-slate-400">/ 10 GB</span>
            <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 ml-1">
              ({((totalSizeBytes / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(1)}% used)
            </span>
          </div>
        </div>

        {/* Multi-segment Combined Storage Bar */}
        <div className="w-full bg-slate-200/70 dark:bg-slate-800/80 h-2.5 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-500"
            style={{ width: `${Math.max((teamTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100, 0.4)}%` }}
            title={`Team Storage: ${formatBytes(teamTotalSize)} (${((teamTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(2)}% of 10 GB)`}
          />
          <div
            className="h-full bg-amber-500 dark:bg-amber-400 transition-all duration-500"
            style={{ width: `${Math.max((systemTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100, 0.2)}%` }}
            title={`System Storage: ${formatBytes(systemTotalSize)} (${((systemTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(2)}% of 10 GB)`}
          />
        </div>

        {/* Operational Limit Badges (matching Cloudflare R2 plan) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-orange-100/80 dark:border-orange-950/50 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400">Team Media:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{formatBytes(teamTotalSize)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400">System Core:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{formatBytes(systemTotalSize)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400">Free Quota:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {formatBytes(Math.max(CLOUDFLARE_R2_QUOTA_BYTES - totalSizeBytes, 0))}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-orange-500 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400">Monthly Egress:</span>
            <span className="font-bold text-orange-600 dark:text-orange-400">$0.00 / Free</span>
          </div>
        </div>
      </div>

      {/* TWO SEPARATE STORAGE LAYER INSIGHT CARDS (Team vs System) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
        {/* Card 1: Team Storage Layer */}
        <div 
          onClick={() => {
            if (activeLayerFilter !== 'team') setActiveLayerFilter('team');
            else setActiveLayerFilter('all');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            activeLayerFilter === 'team'
              ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-600/70 ring-2 ring-indigo-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-200 dark:hover:border-slate-700 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Users className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Team Storage Layer
                  </h3>
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-100/80 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold">
                    Team Accessible
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">Shared files, chat media, CRM data, avatars & tasks</p>
              </div>
            </div>
            <div className="text-right shrink-0 pl-2">
              <span className="text-base font-black text-slate-900 dark:text-white block">{formatBytes(teamTotalSize)}</span>
              <span className="text-[9px] text-slate-400 font-semibold">{teamFileCount} files • {teamCategories.length} folders</span>
            </div>
          </div>

          {/* Progress bar showing % of 10 GB Cloudflare quota */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full transition-all duration-500" 
              style={{ width: `${Math.max((teamTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100, 0.5)}%` }}
              title={`Team: ${formatBytes(teamTotalSize)} (${((teamTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(2)}% of 10 GB)`}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-400 mt-1.5 font-medium">
            <span>
              {((teamTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(1)}% of 10 GB quota ({totalSizeBytes > 0 ? ((teamTotalSize / totalSizeBytes) * 100).toFixed(1) : 0}% of stored files)
            </span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {activeLayerFilter === 'team' ? '✓ Layer Active' : 'Click to isolate'}
            </span>
          </div>
        </div>

        {/* Card 2: System Storage Layer */}
        <div 
          onClick={() => {
            if (activeLayerFilter !== 'system') setActiveLayerFilter('system');
            else setActiveLayerFilter('all');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
            activeLayerFilter === 'system'
              ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-600/70 ring-2 ring-amber-500/20 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 hover:border-amber-200 dark:hover:border-slate-700 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-100 dark:border-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Server className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    System Storage Layer
                  </h3>
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-100/80 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[9px] font-bold">
                    Core System
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">Auth sessions, server logs, configs & backups</p>
              </div>
            </div>
            <div className="text-right shrink-0 pl-2">
              <span className="text-base font-black text-slate-900 dark:text-white block">{formatBytes(systemTotalSize)}</span>
              <span className="text-[9px] text-slate-400 font-semibold">{systemFileCount} files • {systemCategories.length} folders</span>
            </div>
          </div>

          {/* Progress bar showing % of 10 GB Cloudflare quota */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all duration-500" 
              style={{ width: `${Math.max((systemTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100, 0.5)}%` }}
              title={`System: ${formatBytes(systemTotalSize)} (${((systemTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(2)}% of 10 GB)`}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-400 mt-1.5 font-medium">
            <span>
              {((systemTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100) < 0.1 ? '< 0.1%' : ((systemTotalSize / CLOUDFLARE_R2_QUOTA_BYTES) * 100).toFixed(1) + '%'} of 10 GB quota ({totalSizeBytes > 0 ? ((systemTotalSize / totalSizeBytes) * 100).toFixed(1) : 0}% of stored files)
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {activeLayerFilter === 'system' ? '✓ Layer Active' : 'Click to isolate'}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Breadcrumb / Drill-down Bar */}
      <div className="lg:hidden flex items-center justify-between bg-slate-100 dark:bg-slate-950 p-1.5 px-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shrink-0 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setMobileStorageView('groups')}
            className={`font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              mobileStorageView === 'groups'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {groupByMode === 'directory' ? 'Folders' : groupByMode.toUpperCase()}
          </button>

          {selectedGroupKey && (
            <>
              <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => setMobileStorageView('files')}
                className={`font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer truncate max-w-[120px] ${
                  mobileStorageView === 'files'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={selectedGroupKey}
              >
                {selectedGroupKey}
              </button>
            </>
          )}

          {selectedFile && (
            <>
              <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => setMobileStorageView('preview')}
                className={`font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer truncate max-w-[120px] ${
                  mobileStorageView === 'preview'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={cleanFileName(selectedFile)}
              >
                {cleanFileName(selectedFile)}
              </button>
            </>
          )}
        </div>

        {/* Quick Back button on mobile when in files or preview */}
        {mobileStorageView === 'files' && (
          <button
            type="button"
            onClick={() => setMobileStorageView('groups')}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Categories</span>
          </button>
        )}

        {mobileStorageView === 'preview' && (
          <button
            type="button"
            onClick={() => setMobileStorageView('files')}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Files</span>
          </button>
        )}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[21rem_16.5rem_1fr] gap-4 min-h-0">
        
        {/* Column 1: Group Sidebar List */}
        <div className={`${mobileStorageView === 'groups' ? 'flex' : 'hidden lg:flex'} bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex-col min-h-[350px] sm:min-h-[420px] lg:min-h-0 shadow-xs`}>
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-350 uppercase tracking-wider">
              {groupByMode === 'directory' ? 'Storage Folders' : `Group by ${groupByMode}`}
            </h3>
            {groupByMode === 'directory' && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200/40 dark:border-slate-800/40">
                <button
                  type="button"
                  onClick={() => setActiveLayerFilter('all')}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${
                    activeLayerFilter === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                  title="View both Team and System storage cards"
                >
                  All ({categories.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayerFilter('team')}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all flex items-center gap-1 ${
                    activeLayerFilter === 'team'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                  }`}
                  title="Filter to Team storage only"
                >
                  <Users className="h-2.5 w-2.5" /> Team ({teamCategories.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayerFilter('system')}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all flex items-center gap-1 ${
                    activeLayerFilter === 'system'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
                  }`}
                  title="Filter to System storage only"
                >
                  <Server className="h-2.5 w-2.5" /> System ({systemCategories.length})
                </button>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-2.5 space-y-3 min-h-[260px] lg:min-h-0">
            {loadingCategories || loadingAllFiles ? (
              <div className="h-24 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              </div>
            ) : groupByMode === 'directory' ? (
              <div className="space-y-3.5">
                {/* Card 1: Team Storage */}
                {(activeLayerFilter === 'all' || activeLayerFilter === 'team') && (
                  <div className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-2.5">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                          <Users className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                            Team Storage
                          </h4>
                          <p className="text-[9px] text-slate-400">{teamCategories.length} items • {teamFileCount} files</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                        {formatBytes(teamTotalSize)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {teamCategories.length === 0 ? (
                        <p className="p-3 text-center text-[10px] text-slate-400">No team items</p>
                      ) : (
                        teamCategories.map(cat => {
                          const isSelected = selectedGroupKey === cat.name;
                          const pct = teamTotalSize > 0 ? (cat.sizeBytes / teamTotalSize) * 100 : 0;
                          return (
                            <button
                              key={cat.name}
                              onClick={() => handleSelectGroup(cat.name)}
                              className={`w-full text-left p-2.5 rounded-xl transition-all border ${
                                isSelected
                                  ? 'bg-slate-900 text-white shadow-sm border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100'
                                  : 'bg-white dark:bg-slate-900/80 hover:bg-slate-100/70 dark:hover:bg-slate-850/80 border-slate-200/60 dark:border-slate-800/60 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold truncate flex items-center gap-1.5">
                                  {getCategoryIcon(cat.name, false)}
                                  {cat.name}
                                </span>
                                <span className={`text-[9px] font-semibold shrink-0 ${isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>
                                  {cat.fileCount} {cat.fileCount === 1 ? 'file' : 'files'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className={`text-[9px] max-w-[65%] truncate ${isSelected ? 'text-slate-300 dark:text-slate-500' : 'text-slate-400'}`}>
                                  ./storage/{cat.name}
                                </span>
                                <span className="text-[10px] font-black">{formatBytes(cat.sizeBytes)}</span>
                              </div>
                              {/* Aligned space bar relative to Team storage */}
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${isSelected ? 'bg-indigo-400 dark:bg-indigo-600' : 'bg-indigo-600 dark:bg-indigo-400'}`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                  title={`${pct.toFixed(1)}% of Team Storage`}
                                />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Card 2: System Storage */}
                {(activeLayerFilter === 'all' || activeLayerFilter === 'system') && (
                  <div className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-2.5">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded-lg bg-amber-100 dark:bg-amber-950/80 flex items-center justify-center text-amber-600 dark:text-amber-400">
                          <Server className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                            System Storage
                          </h4>
                          <p className="text-[9px] text-slate-400">{systemCategories.length} items • {systemFileCount} files</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-100 dark:border-amber-900/40">
                        {formatBytes(systemTotalSize)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {systemCategories.length === 0 ? (
                        <p className="p-3 text-center text-[10px] text-slate-400">No system items</p>
                      ) : (
                        systemCategories.map(cat => {
                          const isSelected = selectedGroupKey === cat.name;
                          const pct = systemTotalSize > 0 ? (cat.sizeBytes / systemTotalSize) * 100 : 0;
                          return (
                            <button
                              key={cat.name}
                              onClick={() => handleSelectGroup(cat.name)}
                              className={`w-full text-left p-2.5 rounded-xl transition-all border ${
                                isSelected
                                  ? 'bg-slate-900 text-white shadow-sm border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100'
                                  : 'bg-white dark:bg-slate-900/80 hover:bg-slate-100/70 dark:hover:bg-slate-850/80 border-slate-200/60 dark:border-slate-800/60 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold truncate flex items-center gap-1.5">
                                  {getCategoryIcon(cat.name, true)}
                                  {cat.name}
                                </span>
                                <span className={`text-[9px] font-semibold shrink-0 ${isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>
                                  {cat.fileCount} {cat.fileCount === 1 ? 'file' : 'files'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className={`text-[9px] max-w-[65%] truncate ${isSelected ? 'text-slate-300 dark:text-slate-500' : 'text-slate-400'}`}>
                                  ./storage/{cat.name}
                                </span>
                                <span className="text-[10px] font-black">{formatBytes(cat.sizeBytes)}</span>
                              </div>
                              {/* Aligned space bar relative to System storage */}
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${isSelected ? 'bg-amber-400 dark:bg-amber-600' : 'bg-amber-500 dark:bg-amber-400'}`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                  title={`${pct.toFixed(1)}% of System Storage`}
                                />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : groupSidebarItems.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">No items available</p>
            ) : (
              groupSidebarItems.map(item => {
                const isSelected = selectedGroupKey === item.key;
                const percentage = totalSizeBytes > 0 ? (item.sizeBytes / totalSizeBytes) * 100 : 0;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleSelectGroup(item.key)}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold truncate flex items-center gap-1.5">
                        {item.icon}
                        {item.label}
                      </span>
                      <span className={`text-[9px] font-semibold shrink-0 ${isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>
                        {item.fileCount} {item.fileCount === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-[9px] max-w-[70%] truncate ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                        {item.path}
                      </span>
                      <span className="text-[10px] font-black">{formatBytes(item.sizeBytes)}</span>
                    </div>

                    {/* Miniature Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                      <div 
                        className={`h-full ${isSelected ? 'bg-white dark:bg-slate-950' : 'bg-slate-900 dark:bg-slate-100'}`} 
                        style={{ width: `${Math.max(percentage, 2)}%` }} 
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: File Browser inside selected group */}
        <div className={`${mobileStorageView === 'files' ? 'flex' : 'hidden lg:flex'} bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex-col min-h-[350px] sm:min-h-[420px] lg:min-h-0 shadow-xs`}>
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileStorageView('groups')}
                  className="lg:hidden p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer shrink-0"
                  title="Back to categories"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider truncate">
                  {selectedGroupKey ? `${cleanFileName(selectedGroupKey)}` : 'Files'}
                </h3>
                {groupFilteredFiles.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                    ({groupFilteredFiles.length})
                  </span>
                )}
              </div>
              {groupByMode === 'directory' && selectedGroupKey && (
                <div className="flex items-center gap-1">
                  {selectedGroupKey === 'temp_uploads' && (
                    <button
                      onClick={handleCleanTempUploads}
                      disabled={cleaningTemp}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg border border-amber-200 dark:border-amber-800 transition-colors mr-1"
                      title="Purge all scratch and stale chunks"
                    >
                      {cleaningTemp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Purge Temp
                    </button>
                  )}
                  <button
                    onClick={() => setShowCreateFolderModal(true)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-lg text-slate-600 dark:text-slate-350"
                    title="Create New Folder"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-lg text-slate-600 dark:text-slate-350"
                    title="Create New File"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter files..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] text-slate-800 dark:text-slate-250 focus:outline-none"
                style={{ paddingLeft: '2rem' }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {selectedGroupKey === 'temp_uploads' && (
              <div className="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2 text-[10px] text-amber-700 dark:text-amber-300">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Auto-purges scratch files older than 24h</span>
                </div>
                <button
                  onClick={handleCleanTempUploads}
                  disabled={cleaningTemp}
                  className="font-bold underline hover:opacity-80 shrink-0 cursor-pointer"
                >
                  {cleaningTemp ? 'Cleaning...' : 'Purge All'}
                </button>
              </div>
            )}
            {!selectedGroupKey ? (
              <p className="p-4 text-center text-xs text-slate-400">Select a category on the left</p>
            ) : loadingFiles ? (
              <div className="h-24 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              </div>
            ) : (
              <>
                {groupByMode === 'directory' && currentSubpath && (
                  <button
                    onClick={() => {
                      const parts = currentSubpath.split('/');
                      const parentSub = parts.slice(0, -1).join('/');
                      setCurrentSubpath(parentSub);
                      fetchDirectoryFiles(selectedGroupKey!, parentSub);
                    }}
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-500 hover:text-slate-700 transition-all text-xs font-bold shrink-0 mb-1"
                  >
                    <span>← .. ({currentSubpath})</span>
                  </button>
                )}

                {groupFilteredFiles.length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-400">No files found</p>
                ) : (
                  groupFilteredFiles.map(file => {
                    const isSelected = selectedFile === file.name;
                    const isDir = file.isFile === false;
                    const type = getFilePreviewType(file.name);
                    const fileCat = file.category || (groupByMode === 'directory' ? selectedGroupKey : 'uploads') || 'uploads';
                    const fileUrl = `/api/files?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(fileCat)}`;
                    const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';

                    let visualPreview = null;
                    if (isDir) {
                      visualPreview = (
                        <div className="h-10 w-10 min-w-10 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/80 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-500 shrink-0">
                          <Folder className="h-5 w-5 fill-indigo-500/20" />
                        </div>
                      );
                    } else if (type === 'image') {
                      visualPreview = (
                        <div className="h-10 w-10 min-w-10 rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center shrink-0 shadow-sm">
                          <img
                            src={fileUrl}
                            alt={file.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector('.img-thumb-fallback') as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div className="img-thumb-fallback hidden absolute inset-0 items-center justify-center bg-slate-100 dark:bg-slate-800 text-emerald-500">
                            <FileImage className="h-4 w-4" />
                          </div>
                        </div>
                      );
                    } else if (type === 'pdf') {
                      visualPreview = (
                        <div className="h-10 w-10 min-w-10 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/80 dark:bg-rose-950/40 flex flex-col items-center justify-center text-rose-500 shrink-0 shadow-sm">
                          <FileText className="h-4 w-4" />
                          <span className="text-[7.5px] font-black tracking-tight mt-0.5 text-rose-600 dark:text-rose-400">PDF</span>
                        </div>
                      );
                    } else if (type === 'video') {
                      visualPreview = (
                        <div className="h-10 w-10 min-w-10 rounded-xl border border-purple-200/80 dark:border-purple-900/50 bg-purple-50/80 dark:bg-purple-950/40 flex flex-col items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-sm">
                          <Play className="h-3.5 w-3.5 fill-purple-500 text-purple-600" />
                          <span className="text-[7.5px] font-black tracking-tight mt-0.5 text-purple-600 dark:text-purple-400">VIDEO</span>
                        </div>
                      );
                    } else if (type === 'audio') {
                      visualPreview = (
                        <div className="h-10 w-10 min-w-10 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/40 flex flex-col items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-sm">
                          <Volume2 className="h-4 w-4" />
                          <span className="text-[7.5px] font-black tracking-tight mt-0.5 text-amber-600 dark:text-amber-400">AUDIO</span>
                        </div>
                      );
                    } else if (type === 'text') {
                      visualPreview = (
                        <div className="h-10 w-10 min-w-10 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/40 flex flex-col items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-sm">
                          <FileCode className="h-4 w-4" />
                          <span className="text-[7.5px] font-black tracking-tight mt-0.5 text-blue-600 dark:text-blue-400">
                            {file.name.endsWith('.json') ? 'JSON' : 'CODE'}
                          </span>
                        </div>
                      );
                    } else {
                      visualPreview = (
                        <div className="h-10 w-10 min-w-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 shrink-0 shadow-sm">
                          <File className="h-4 w-4" />
                          <span className="text-[7.5px] font-black tracking-tight mt-0.5 text-slate-400">FILE</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={file.name}
                        onClick={() => {
                          if (isDir) {
                            setCurrentSubpath(file.name);
                            fetchDirectoryFiles(selectedGroupKey!, file.name);
                          } else {
                            handleSelectFile(file);
                          }
                        }}
                        className={`group w-full text-left p-2 rounded-xl transition-all border flex items-center gap-3 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 shadow-sm'
                            : 'border-slate-100/80 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {visualPreview}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 w-full min-w-0">
                            <span
                              className={`text-xs truncate leading-snug ${isSelected ? 'font-bold text-indigo-900 dark:text-indigo-200' : 'font-medium'}`}
                              title={file.name}
                            >
                              {isDir ? file.name.split('/').pop() : cleanFileName(file.name)}
                            </span>

                            {groupByMode === 'directory' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsFolderRename(isDir);
                                  setRenameTargetName(file.name);
                                  setNewTargetNameInput(file.name);
                                  setShowRenameModal(true);
                                }}
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition-opacity text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                                title={isDir ? 'Rename Folder' : 'Rename File'}
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 truncate">
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {isDir ? 'Folder' : formatBytes(file.sizeBytes)}
                            </span>
                            <span>•</span>
                            <span>{new Date(file.updatedAt).toLocaleDateString()}</span>
                            {!isDir && (
                              <>
                                <span>•</span>
                                <span className="uppercase text-[8.5px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono font-medium">
                                  {ext}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>

        {/* Column 3: File Viewer & Dedicated Previews */}
        <div className={`${mobileStorageView === 'preview' ? 'flex' : 'hidden lg:flex'} bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex-col min-h-[350px] sm:min-h-[420px] lg:min-h-0 overflow-hidden shadow-xs`}>
          {!selectedFile ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/30">
              <File className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold text-slate-500">No File Selected</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-normal">
                Select a file to play voice memos, preview photos, view PDFs, or edit JSON configurations.
              </p>
              <button
                type="button"
                onClick={() => setMobileStorageView('files')}
                className="lg:hidden mt-3 px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold shadow-xs cursor-pointer"
              >
                Browse Files
              </button>
            </div>
          ) : loadingContent ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* File Title & Basic Actions Toolbar */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20 shrink-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileStorageView('files')}
                    className="lg:hidden p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer shrink-0"
                    title="Back to files list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate">{cleanFileName(selectedFile)}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                      Path: storage/{selectedFileCategory}/{selectedFile}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Prev / Next Pagination Arrows in header */}
                  {previewableFiles.length > 1 && (
                    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/60 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 mr-1">
                      <button
                        type="button"
                        onClick={handlePrevFile}
                        disabled={currentFileIndex <= 0}
                        className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        title="Previous File"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 font-mono px-1">
                        {currentFileIndex + 1}/{previewableFiles.length}
                      </span>
                      <button
                        type="button"
                        onClick={handleNextFile}
                        disabled={currentFileIndex < 0 || currentFileIndex >= previewableFiles.length - 1}
                        className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        title="Next File"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <a
                    href={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-all flex items-center justify-center cursor-pointer"
                    title="Open in New Tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  <button
                    onClick={() => {
                      setIsFolderRename(false);
                      setRenameTargetName(selectedFile);
                      setNewTargetNameInput(selectedFile);
                      setShowRenameModal(true);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-500 hover:text-slate-850 dark:hover:text-slate-150 transition-all"
                    title="Rename File"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={downloadFile}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-all"
                    title="Download Original File"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  
                  <button
                    onClick={deleteFile}
                    disabled={deletingFile}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-850 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-500 hover:text-red-500 transition-all disabled:opacity-40"
                    title="Delete File"
                  >
                    {deletingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>

                  {getFilePreviewType(selectedFile) === 'text' && (
                    <>
                      <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-800 mx-1" />
                      <button
                        onClick={saveChanges}
                        disabled={savingFile || jsonError !== null || fileContent === originalContent}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[10px] font-bold transition-all shadow-sm"
                      >
                        {savingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save Edits
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Advanced Metadata Linkages Panel */}
              {(selectedFileCategory === 'uploads' || selectedFileCategory === 'avatars' || selectedFileCategory === 'attachments') && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                  <div className="flex flex-wrap gap-2.5 items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client Link:</span>
                      <select
                        value={linkedClientId}
                        onChange={e => {
                          setLinkedClientId(e.target.value);
                          setLinkedProjectId(''); // Reset project on client change
                          saveMetadataLinkages(e.target.value, '');
                        }}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] focus:outline-none"
                      >
                        <option value="">No Client Linked</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Link:</span>
                      <select
                        value={linkedProjectId}
                        onChange={e => {
                          setLinkedProjectId(e.target.value);
                          saveMetadataLinkages(linkedClientId, e.target.value);
                        }}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] focus:outline-none"
                      >
                        <option value="">No Project Linked</option>
                        {visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {savingMetadata && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving connection...
                    </span>
                  )}
                </div>
              )}

              {/* Preview Core Window */}
              <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30 dark:bg-slate-950/5">
                
                {/* 1. IMAGE PREVIEW */}
                {getFilePreviewType(selectedFile) === 'image' && (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto bg-slate-100/50 dark:bg-slate-950/40">
                    <div className="max-w-full max-h-[62vh] flex items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800/80 relative">
                      {!imageError ? (
                        <img
                          src={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                          alt={cleanFileName(selectedFile)}
                          className="max-h-[58vh] max-w-full object-contain rounded-xl"
                          onError={() => setImageError(true)}
                          onLoad={() => setImageError(false)}
                        />
                      ) : (
                        <div className="p-8 flex flex-col items-center text-center">
                          <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Image preview unavailable</p>
                          <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
                            The file format might not be supported directly in this view or may be a non-standard image.
                          </p>
                          <a
                            href={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 hover:bg-indigo-100"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open File Directly
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{cleanFileName(selectedFile)}</span>
                      <span>•</span>
                      <span>{formatBytes(fileSizeBytes)}</span>
                      <span>•</span>
                      <a
                        href={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <ExternalLink className="h-3 w-3" /> Open in New Tab
                      </a>
                    </div>
                  </div>
                )}

                {/* 2. AUDIO PLAYER PREVIEW */}
                {getFilePreviewType(selectedFile) === 'audio' && (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50 dark:bg-slate-950/20">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-8 rounded-3xl shadow-sm max-w-md w-full text-center">
                      <div className="h-16 w-16 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-500 shadow-sm">
                        <Volume2 className="h-8 w-8" />
                      </div>
                      <h4 className="text-xs font-bold truncate mb-1">{cleanFileName(selectedFile)}</h4>
                      <p className="text-[10px] text-slate-400 mb-6">{formatBytes(fileSizeBytes)}</p>
                      
                      <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                        <audio
                          src={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                          controls
                          className="w-full h-8 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. VIDEO PLAYER PREVIEW */}
                {getFilePreviewType(selectedFile) === 'video' && (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 bg-slate-950">
                    <video
                      src={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                      controls
                      className="max-h-[60vh] max-w-full rounded-xl shadow-lg border border-slate-800 bg-black"
                    />
                    <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400">
                      <span>{cleanFileName(selectedFile)}</span>
                      <span>•</span>
                      <span>{formatBytes(fileSizeBytes)}</span>
                      <span>•</span>
                      <a
                        href={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-400 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Full Screen / New Tab
                      </a>
                    </div>
                  </div>
                )}

                {/* 4. PDF DOCUMENT PREVIEW */}
                {getFilePreviewType(selectedFile) === 'pdf' && (
                  <div className="flex-1 flex flex-col min-h-0 bg-slate-100 dark:bg-slate-950">
                    <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-rose-500" /> PDF Document Preview
                      </span>
                      <a
                        href={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Open in New Tab
                      </a>
                    </div>
                    <iframe
                      src={`/api/files?name=${encodeURIComponent(selectedFile)}&type=${encodeURIComponent(selectedFileCategory || 'uploads')}#toolbar=1`}
                      className="w-full flex-1 border-0"
                      title={cleanFileName(selectedFile)}
                    />
                  </div>
                )}

                {/* 5. TEXT / CODE EDITOR PREVIEW */}
                {getFilePreviewType(selectedFile) === 'text' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* JSON Banner validator */}
                    {jsonError ? (
                      <div className="px-4 py-2 bg-red-50 dark:bg-red-950/20 border-b border-red-200/50 dark:border-red-900/20 text-red-600 dark:text-red-400 text-[10px] flex items-center gap-2 font-medium shrink-0">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">JSON Format Error: {jsonError}</span>
                      </div>
                    ) : selectedFile.endsWith('.json') ? (
                      <div className="px-4 py-2 bg-emerald-50/50 dark:bg-emerald-950/10 border-b border-emerald-200/20 dark:border-emerald-900/10 text-emerald-600 dark:text-emerald-400 text-[10px] flex items-center gap-2 font-medium shrink-0">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Valid JSON Database Record</span>
                      </div>
                    ) : null}

                    <div className="flex-1 min-h-0 relative">
                      <textarea
                        value={fileContent}
                        onChange={e => handleContentChange(e.target.value)}
                        placeholder="Write content..."
                        className="absolute inset-0 w-full h-full p-4 font-mono text-[11px] leading-relaxed resize-none focus:outline-none bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* 6. OTHER BINARY FILE CARD */}
                {getFilePreviewType(selectedFile) === 'unknown' && (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <File className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-3" />
                    <h4 className="text-xs font-bold truncate mb-1">{cleanFileName(selectedFile)}</h4>
                    <p className="text-[10px] text-slate-400 mb-6">
                      Binary Format · {formatBytes(fileSizeBytes)}
                    </p>
                    <button
                      onClick={downloadFile}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      <Download className="h-4 w-4" /> Download File to Open
                    </button>
                  </div>
                )}

              </div>

              {/* Dedicated Pagination Footer for Mobile / Page-wise View */}
              {previewableFiles.length > 1 && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between shrink-0">
                  <button
                    type="button"
                    onClick={handlePrevFile}
                    disabled={currentFileIndex <= 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Previous</span>
                  </button>

                  <div className="text-center px-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono block">
                      {currentFileIndex + 1} of {previewableFiles.length}
                    </span>
                    <span className="text-[9px] text-slate-400 truncate block max-w-[140px]">
                      {cleanFileName(selectedFile)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleNextFile}
                    disabled={currentFileIndex < 0 || currentFileIndex >= previewableFiles.length - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

            </div>
          )}
        </div>

      </div>

      {/* New Folder Modal */}
      {showCreateFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-955/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateFolderModal(false); setNewFolderName(''); } }}
        >
          <div className="w-full max-w-sm max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 flex flex-col overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Create Folder in storage/{selectedGroupKey}{currentSubpath ? `/${currentSubpath}` : ''}
              </h3>
              <button
                type="button"
                onClick={() => { setShowCreateFolderModal(false); setNewFolderName(''); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={createNewFolder} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Folder Name
                </label>
                <input
                  required
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="e.g. documents or backup_data"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none animate-fade-in"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateFolderModal(false); setNewFolderName(''); }}
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 text-slate-650 dark:text-slate-400 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-955 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFile || !newFolderName.trim()}
                  className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-all rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {savingFile ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New File Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-955/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); setNewFileName(''); setNewFileContent(''); } }}
        >
          <div className="w-full max-w-md max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 flex flex-col overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Create File in storage/{selectedGroupKey}
              </h3>
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setNewFileName(''); setNewFileContent(''); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={createNewFile} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Filename
                </label>
                <input
                  required
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  placeholder="e.g. record.json or custom.txt"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Initial Content (Optional)
                </label>
                <textarea
                  value={newFileContent}
                  onChange={e => setNewFileContent(e.target.value)}
                  placeholder="{}"
                  rows={6}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-mono focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setNewFileName(''); setNewFileContent(''); }}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-950"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFile}
                  className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {savingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-955/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowRenameModal(false); setNewTargetNameInput(''); } }}
        >
          <div className="w-full max-w-sm max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 flex flex-col overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Rename {isFolderRename ? 'Folder' : 'File'}
              </h3>
              <button
                type="button"
                onClick={() => { setShowRenameModal(false); setNewTargetNameInput(''); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={renameFileOrFolder} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Current path
                </label>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-500 font-mono truncate select-all">
                  storage/{selectedGroupKey}/{renameTargetName}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  New name
                </label>
                <input
                  required
                  value={newTargetNameInput}
                  onChange={e => setNewTargetNameInput(e.target.value)}
                  placeholder={isFolderRename ? "e.g. new_folder_name" : "e.g. new_file_name.json"}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowRenameModal(false); setNewTargetNameInput(''); }}
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 text-slate-650 dark:text-slate-400 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-955 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFile || !newTargetNameInput.trim() || newTargetNameInput.trim() === renameTargetName}
                  className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-all rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {savingFile ? 'Renaming...' : 'Rename'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
