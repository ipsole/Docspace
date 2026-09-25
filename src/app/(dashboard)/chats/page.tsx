'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  Plus, Search, Send, Paperclip, Smile, Edit2, Trash2, Reply, Pin,
  Hash, User, Circle, ArrowDown, FileText, Image as ImageIcon, Loader2, Mic,
  X, Phone, MoreVertical, ChevronLeft, Download, Play, Pause, StopCircle,
  AlertCircle, Bell, Building2, ExternalLink, Globe, Mail, MapPin, Users2,
  Calendar, DollarSign, ChevronRight, ChevronDown, FolderKanban, Database, Link2, Unlink,
  Clock, UserX, CheckCircle2, Tag, GripVertical, Lock
} from 'lucide-react';

import { uploadFile, uploadFolder } from '@/lib/uploadHelper';

interface Attachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  content: string;
  createdAt: string;
  reactions?: Record<string, string[]>;
  replyTo?: string;
  replyToContent?: string;
  pinned?: boolean;
  attachments?: Attachment[];
  isEdited?: boolean;
  deleted?: boolean;
}

interface Conversation {
  id: string;
  workspaceId: string;
  name?: string;
  type: 'direct' | 'group' | 'channel';
  avatar?: string;
  description?: string;
  creatorId?: string;
  members: string[];
  memberNames?: Record<string, string>;
  createdAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  clientId?: string | null;
}

interface ApiUser {
  id: string;
  username: string;
  displayName: string;
  avatar?: string | null;
  status?: string;
  role?: string;
}

interface ApiConversation {
  id: string;
  workspaceId: string;
  name: string | null;
  isChannel: boolean;
  isGroup?: boolean;
  avatar?: string | null;
  description?: string | null;
  creatorId?: string | null;
  participants: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage: { content: string; createdAt: string } | null;
  clientId?: string | null;
}

interface ApiMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  attachments?: Attachment[];
  replyTo: string | null;
  reactions: { userId: string; emoji: string }[];
  pinned?: boolean;
}

interface Client {
  id: string;
  workspaceId: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  website?: string;
  industry?: string;
  status?: 'active' | 'inactive';
  notes?: string;
  tags?: string[];
}

interface Project {
  id: string;
  name: string;
  clientId: string | null;
  progress: number;
  status: string;
  businessType?: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  total: number;
  dueDate: string;
  status: 'paid' | 'unpaid' | 'overdue';
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  type: string;
}

const EMOJI_LIST = ['👍','❤️','😂','😮','😢','🎉','🔥','👏'];

export default function ChatsPage() {
  const { user } = useAuth();
  const { activeWorkspace, getTabAccess, currentMember } = useWorkspace();
  const isReadOnly = getTabAccess('chats') === 'view';

  const isWorkspaceAdminOrOwner = useMemo(() => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (activeWorkspace && activeWorkspace.ownerId === user.id) return true;
    if (currentMember && (currentMember.role === 'owner' || currentMember.role === 'admin' || currentMember.role === 'manager')) return true;
    return false;
  }, [user, activeWorkspace, currentMember]);

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const cached = sessionStorage.getItem('cached_conversations');
      if (!cached) return [];
      const list: Conversation[] = JSON.parse(cached);
      return Array.from(new Map(list.map(c => [c.id, c])).values());
    } catch { return []; }
  });
  const [activeConv, setActiveConv] = useState<Conversation | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const savedId = sessionStorage.getItem('last_active_chat_id');
      const cached = sessionStorage.getItem('cached_conversations');
      if (savedId && cached) {
        const list: Conversation[] = JSON.parse(cached);
        return list.find(c => c.id === savedId) || null;
      }
      return null;
    } catch { return null; }
  });

  const isConvoAdmin = useMemo(() => {
    if (!user || !activeConv) return false;
    return activeConv.type !== 'direct' && (
      activeConv.creatorId === user.id || 
      activeConv.members?.[0] === user.id
    );
  }, [user, activeConv]);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const savedId = sessionStorage.getItem('last_active_chat_id');
      if (savedId) {
        const cached = sessionStorage.getItem(`cached_msgs_${savedId}`);
        return cached ? JSON.parse(cached) : [];
      }
      return [];
    } catch { return []; }
  });
  const [usersById, setUsersById] = useState<Record<string, ApiUser>>({});
  const [userIdByUsername, setUserIdByUsername] = useState<Record<string, string>>({});
  const [loadingConvs, setLoadingConvs] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return sessionStorage.getItem('cached_conversations') ? false : true;
    } catch { return true; }
  });
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const savedId = sessionStorage.getItem('last_active_chat_id');
      return savedId ? (sessionStorage.getItem(`chat_draft_${savedId}`) || '') : '';
    } catch { return ''; }
  });
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState('');
  const [viewingFile, setViewingFile] = useState<Attachment | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatDescription, setNewChatDescription] = useState('');
  const [newChatType, setNewChatType] = useState<'direct' | 'group' | 'channel'>('direct');
  const [creatingChat, setCreatingChat] = useState(false);
  const [workspaceTasks, setWorkspaceTasks] = useState<any[]>([]);
  const [showStoragePopover, setShowStoragePopover] = useState(false);
  const [storageCategoryTab, setStorageCategoryTab] = useState<'all' | 'images' | 'docs' | 'media' | 'others'>('all');
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
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [showChatProfileModal, setShowChatProfileModal] = useState(false);
  const [editingChatName, setEditingChatName] = useState('');
  const [isRenamingChat, setIsRenamingChat] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [editingChatDescription, setEditingChatDescription] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showPinnedMessagesModal, setShowPinnedMessagesModal] = useState(false);
  const [confirmPhraseInput, setConfirmPhraseInput] = useState('');
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [newMessageNotice, setNewMessageNotice] = useState<{ chatId: string; count: number; senderName: string } | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [typingUsers, setTypingUsers] = useState<Record<string, { username: string; isTyping: boolean }>>({});

  // WhatsApp-style Client Peek Sidebar integration states
  const [showClientSidebar, setShowClientSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'info' | 'projects' | 'billing' | 'files' | 'events'>('info');
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [crmProjects, setCrmProjects] = useState<Project[]>([]);
  const [crmInvoices, setCrmInvoices] = useState<Invoice[]>([]);
  const [crmEvents, setCrmEvents] = useState<CalendarEvent[]>([]);
  const [clientFiles, setClientFiles] = useState<any[]>([]);
  const [loadingClientFiles, setLoadingClientFiles] = useState(false);
  const [chatClientLinks, setChatClientLinks] = useState<Record<string, string>>({});
  type FilterTabId = 'all' | 'channels' | 'clients' | 'direct' | 'groups' | 'older' | 'inactive';
  const DEFAULT_FILTER_TAB_ORDER: FilterTabId[] = ['all', 'channels', 'clients', 'direct', 'groups', 'older', 'inactive'];

  const [activeFilterTab, setActiveFilterTab] = useState<FilterTabId>(() => {
    if (typeof window === 'undefined') return 'all';
    try {
      return (sessionStorage.getItem('last_chat_filter') as any) || 'all';
    } catch { return 'all'; }
  });

  const [filterTabOrder, setFilterTabOrder] = useState<FilterTabId[]>(DEFAULT_FILTER_TAB_ORDER);
  const [draggedTabId, setDraggedTabId] = useState<FilterTabId | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<FilterTabId | null>(null);
  const isDraggingTabRef = useRef(false);

  // Sync user-specific filter tab order from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = user?.id ? `chat_filter_tab_order_${user.id}` : 'chat_filter_tab_order_guest';
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: FilterTabId[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(id => DEFAULT_FILTER_TAB_ORDER.includes(id));
          const missing = DEFAULT_FILTER_TAB_ORDER.filter(id => !valid.includes(id));
          setFilterTabOrder([...valid, ...missing]);
        }
      }
    } catch {}
  }, [user?.id]);

  const saveFilterTabOrder = (newOrder: FilterTabId[]) => {
    setFilterTabOrder(newOrder);
    if (typeof window === 'undefined') return;
    const storageKey = user?.id ? `chat_filter_tab_order_${user.id}` : 'chat_filter_tab_order_guest';
    try {
      localStorage.setItem(storageKey, JSON.stringify(newOrder));
    } catch {}
  };

  const handleTabDragStart = (e: React.DragEvent, tabId: FilterTabId) => {
    isDraggingTabRef.current = true;
    setDraggedTabId(tabId);
    e.dataTransfer.setData('text/plain', tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTabDragOver = (e: React.DragEvent, tabId: FilterTabId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverTabId !== tabId) {
      setDragOverTabId(tabId);
    }
  };

  const handleTabDragLeave = (e: React.DragEvent, tabId: FilterTabId) => {
    if (dragOverTabId === tabId) {
      setDragOverTabId(null);
    }
  };

  const handleTabDrop = (e: React.DragEvent, targetTabId: FilterTabId) => {
    e.preventDefault();
    const sourceTabId = (draggedTabId || e.dataTransfer.getData('text/plain')) as FilterTabId;
    if (sourceTabId && sourceTabId !== targetTabId) {
      const oldIndex = filterTabOrder.indexOf(sourceTabId);
      const newIndex = filterTabOrder.indexOf(targetTabId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = [...filterTabOrder];
        const [moved] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, moved);
        saveFilterTabOrder(newOrder);
      }
    }
    setDraggedTabId(null);
    setDragOverTabId(null);
    setTimeout(() => {
      isDraggingTabRef.current = false;
    }, 60);
  };

  const handleTabDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
    setTimeout(() => {
      isDraggingTabRef.current = false;
    }, 60);
  };
  const [newChatClient, setNewChatClient] = useState<Client | null>(null);
  const [newClientChatName, setNewClientChatName] = useState('');
  const [newClientChatType, setNewClientChatType] = useState<'channel' | 'group'>('channel');
  const [creatingClientChat, setCreatingClientChat] = useState(false);
  const [convToDelete, setConvToDelete] = useState<Conversation | null>(null);
  const [clientStatusConfirm, setClientStatusConfirm] = useState<{ client: Client; targetStatus: 'active' | 'inactive' } | null>(null);
  const [isUpdatingClientStatus, setIsUpdatingClientStatus] = useState(false);
  const [clientMenuOpenId, setClientMenuOpenId] = useState<string | null>(null);
  const [collapsedClientIds, setCollapsedClientIds] = useState<Record<string, boolean>>({});

  const toggleClientCollapse = (clientId: string) => {
    setCollapsedClientIds(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  // Tags & Collections filter state for Clients tab
  const DEFAULT_CUSTOM_TAGS = ['Important Client', 'High Ticket', 'Low Ticket'];
  const [customTags, setCustomTags] = useState<string[]>(DEFAULT_CUSTOM_TAGS);
  const [clientTagFilter, setClientTagFilter] = useState<string>('all');

  const getTagIcon = (tag: string) => {
    const lower = tag.toLowerCase();
    if (lower.includes('important') || lower.includes('vip') || lower.includes('star')) return '⭐';
    if (lower.includes('high') || lower.includes('premium') || lower.includes('diamond')) return '💎';
    if (lower.includes('low') || lower.includes('basic')) return '🏷️';
    if (lower.includes('untagged')) return '⚪';
    if (lower.includes('agency') || lower.includes('b2b')) return '🏢';
    if (lower.includes('partner')) return '🤝';
    if (lower.includes('tech') || lower.includes('dev')) return '💻';
    if (lower.includes('media') || lower.includes('video')) return '🎬';
    return '🏷️';
  };

  // Sync customTags with API, localStorage and crmClients
  useEffect(() => {
    if (!activeWorkspace?.id) return;
    let isCancelled = false;

    const syncTags = async () => {
      let localTags: string[] = [];
      try {
        const stored = localStorage.getItem(`client_custom_tags_${activeWorkspace.id}`) || localStorage.getItem(`crm_custom_tags_${activeWorkspace.id}`);
        if (stored) localTags = JSON.parse(stored);
      } catch {}

      const clientTags = Array.from(new Set(crmClients.flatMap(c => c.tags || []))).filter(Boolean);
      const mergedLocal = Array.from(new Set([...DEFAULT_CUSTOM_TAGS, ...localTags, ...clientTags]));
      if (!isCancelled) setCustomTags(mergedLocal);

      try {
        const res = await fetch(`/api/crm/tags?workspaceId=${activeWorkspace.id}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tags) && !isCancelled) {
            const serverMerged = Array.from(new Set([...data.tags, ...mergedLocal]));
            setCustomTags(serverMerged);
          }
        }
      } catch {}
    };

    syncTags();

    const handleTagsUpdated = (e: any) => {
      if (e?.detail?.tags && Array.isArray(e.detail.tags)) {
        setCustomTags(prev => Array.from(new Set([...prev, ...e.detail.tags])));
      }
    };
    const handleClientsUpdated = () => {
      fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (Array.isArray(data)) setCrmClients(data);
        })
        .catch(() => {});
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === `client_custom_tags_${activeWorkspace.id}` || e.key === `crm_custom_tags_${activeWorkspace.id}`) {
        try {
          if (e.newValue) setCustomTags(JSON.parse(e.newValue));
        } catch {}
      }
    };

    window.addEventListener('crm_tags_updated', handleTagsUpdated);
    window.addEventListener('crm_clients_updated', handleClientsUpdated);
    window.addEventListener('storage', handleStorage);

    return () => {
      isCancelled = true;
      window.removeEventListener('crm_tags_updated', handleTagsUpdated);
      window.removeEventListener('crm_clients_updated', handleClientsUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, [activeWorkspace?.id, crmClients]);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat link to Project Stage integration states
  const [linkingAttachment, setLinkingAttachment] = useState<any | null>(null);
  const [selectedProjectForLink, setSelectedProjectForLink] = useState<string>('');
  const [projectTasksForLink, setProjectTasksForLink] = useState<any[]>([]);
  const [loadingTasksForLink, setLoadingTasksForLink] = useState(false);
  const [linkingSuccessMessage, setLinkingSuccessMessage] = useState('');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioFile, setRecordedAudioFile] = useState<File | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const activeConvIdRef = useRef<string | null>(null);

  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowScrollDown(false);
    if (activeConvIdRef.current) {
      setNewMessageNotice(prev => prev?.chatId === activeConvIdRef.current ? null : prev);
    }
  }, []);

  const playNotification = useCallback(() => {
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const audio = new AudioCtor();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.2);
    } catch { /* ignore */ }
  }, []);

  const usersByIdRef = useRef<Record<string, ApiUser>>({});
  const userRef = useRef(user);

  useEffect(() => {
    usersByIdRef.current = usersById;
  }, [usersById]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const normalizeConversation = useCallback((conv: ApiConversation): Conversation => {
    const memberNames = conv.participants.reduce<Record<string, string>>((acc, id) => {
      const profile = usersByIdRef.current[id];
      acc[id] = profile?.displayName || profile?.username || 'Unknown';
      return acc;
    }, {});

    return {
      id: conv.id,
      workspaceId: conv.workspaceId,
      name: conv.name || undefined,
      type: conv.isChannel ? 'channel' : (conv.isGroup ? 'group' : 'direct'),
      avatar: conv.avatar || undefined,
      description: conv.description || undefined,
      creatorId: conv.creatorId || undefined,
      members: conv.participants,
      memberNames,
      createdAt: conv.createdAt,
      lastMessage: conv.lastMessage?.content,
      lastMessageAt: conv.lastMessage?.createdAt || conv.updatedAt,
      clientId: conv.clientId || null,
    };
  }, []);

  const normalizeMessage = useCallback((msg: ApiMessage): Message => {
    const reactions = msg.reactions.reduce<Record<string, string[]>>((acc, reaction) => {
      acc[reaction.emoji] = acc[reaction.emoji] || [];
      acc[reaction.emoji].push(reaction.userId);
      return acc;
    }, {});
    const sender = usersByIdRef.current[msg.senderId];

    return {
      id: msg.id,
      chatId: msg.chatId,
      senderId: msg.senderId,
      senderName: sender?.displayName || sender?.username || 'Unknown',
      senderAvatar: sender?.avatar || null,
      content: msg.content,
      createdAt: msg.createdAt,
      reactions,
      replyTo: msg.replyTo || undefined,
      attachments: msg.attachments || [],
      isEdited: msg.editedAt !== null,
      deleted: msg.deleted,
      pinned: msg.pinned || false,
    };
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const [membersRes, chatsRes] = await Promise.all([
        fetch(`/api/workspaces/members?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/chat?workspaceId=${activeWorkspace.id}`)
      ]);

      if (membersRes.ok) {
        const list: any[] = await membersRes.json();
        const mapping: Record<string, ApiUser> = {};
        const userMapping: Record<string, string> = {};
        list.forEach((item: any) => {
          const u = item.user;
          if (u) {
            mapping[u.id] = u;
            userMapping[u.username.toLowerCase()] = u.id;
          }
        });
        setUsersById(mapping);
        setUserIdByUsername(userMapping);
      }
      if (chatsRes.ok) {
        const raw: ApiConversation[] = await chatsRes.json();
        const norms = raw.map(normalizeConversation);
        const uniqueNorms = Array.from(new Map(norms.map(c => [c.id, c])).values());
        setConversations(uniqueNorms);
        try {
          sessionStorage.setItem('cached_conversations', JSON.stringify(uniqueNorms));
        } catch {}

        // Restore activeConv if not set or update it with fresh details
        const savedChatId = typeof window !== 'undefined' ? sessionStorage.getItem('last_active_chat_id') : null;
        setActiveConv(prev => {
          if (prev) {
            return norms.find(c => c.id === prev.id) || prev;
          }
          if (savedChatId) {
            return norms.find(c => c.id === savedChatId) || null;
          }
          return null;
        });
      }
    } catch { /* ignore */ }
    finally { setLoadingConvs(false); }
  }, [activeWorkspace, normalizeConversation]);

  const fetchWorkspaceTasks = async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/projects/tasks?workspaceId=${activeWorkspace.id}`);
      if (res.ok) setWorkspaceTasks(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  // Load Linked CRM parameters
  const fetchCRMData = async () => {
    if (!activeWorkspace) return;
    try {
      const [clientsRes, projectsRes, invoicesRes, eventsRes] = await Promise.all([
        fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/projects?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/crm/invoices?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/calendar?workspaceId=${activeWorkspace.id}`),
      ]);
      if (clientsRes.ok) setCrmClients(await clientsRes.json());
      if (projectsRes.ok) setCrmProjects(await projectsRes.json());
      if (invoicesRes.ok) setCrmInvoices(await invoicesRes.json());
      if (eventsRes.ok) setCrmEvents(await eventsRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchCRMData();
    fetchWorkspaceTasks();
    
    // Load local links
    const stored = localStorage.getItem('chat_client_links');
    if (stored) {
      try { setChatClientLinks(JSON.parse(stored)); } catch {}
    }
  }, [activeWorkspace]);

  const chatFiles = useMemo(() => {
    const files: any[] = [];
    messages.forEach(msg => {
      if (msg.attachments && msg.attachments.length > 0 && !msg.deleted) {
        msg.attachments.forEach(att => {
          files.push({
            id: att.id,
            name: att.name,
            url: att.url,
            size: att.size || 0,
            mimeType: att.mimeType,
            messageId: msg.id,
            createdAt: msg.createdAt
          });
        });
      }
    });
    return files;
  }, [messages]);

  const totalStorageBytes = useMemo(() => {
    return chatFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  }, [chatFiles]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredChatFiles = useMemo(() => {
    return chatFiles.filter(file => {
      if (storageCategoryTab === 'all') return true;
      const mime = file.mimeType.toLowerCase();
      if (storageCategoryTab === 'images') return mime.startsWith('image/');
      if (storageCategoryTab === 'docs') {
        return mime.startsWith('text/') || mime === 'application/pdf' || 
               file.name.endsWith('.doc') || file.name.endsWith('.docx') || 
               file.name.endsWith('.xls') || file.name.endsWith('.xlsx');
      }
      if (storageCategoryTab === 'media') return mime.startsWith('audio/') || mime.startsWith('video/');
      // 'others'
      return !mime.startsWith('image/') && !mime.startsWith('audio/') && !mime.startsWith('video/') && 
             !mime.startsWith('text/') && mime !== 'application/pdf' && 
             !file.name.endsWith('.doc') && !file.name.endsWith('.docx') && 
             !file.name.endsWith('.xls') && !file.name.endsWith('.xlsx');
    });
  }, [chatFiles, storageCategoryTab]);

  // Client link selector helper
  const linkChatToClient = async (chatId: string, clientId: string) => {
    const isUnlink = !clientId || clientId === 'none';
    const targetVal = isUnlink ? null : clientId;

    const updated = { ...chatClientLinks, [chatId]: isUnlink ? 'none' : clientId };
    setChatClientLinks(updated);
    localStorage.setItem('chat_client_links', JSON.stringify(updated));

    setActiveConv(prev => (prev && prev.id === chatId ? { ...prev, clientId: targetVal } : prev));
    setConversations(prev => prev.map(c => c.id === chatId ? { ...c, clientId: targetVal } : c));

    if (targetVal) {
      fetchClientFiles(targetVal);
    } else {
      setClientFiles([]);
    }

    try {
      await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          action: 'set_client',
          value: targetVal
        })
      });
    } catch (err) {
      console.error('Failed to persist chat client linkage:', err);
    }
  };

  useEffect(() => {
    setShowStoragePopover(false);
  }, [activeConv]);

  const handleLinkFileToTask = async (file: any, taskId: string) => {
    if (!activeWorkspace || !taskId) return;
    const task = workspaceTasks.find(t => t.id === taskId);
    if (!task) return;
    
    const existingAttachments = task.attachments || [];
    if (existingAttachments.some((att: any) => att.url === file.url)) {
      alert('This file is already linked to this task!');
      return;
    }

    const newAtt = {
      id: file.id || Math.random().toString(),
      name: file.name,
      url: file.url,
      size: file.size || 0,
      mimeType: file.mimeType || 'application/octet-stream'
    };

    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          workspaceId: activeWorkspace.id,
          attachments: [...existingAttachments, newAtt]
        })
      });
      if (res.ok) {
        fetchWorkspaceTasks();
      } else {
        alert('Failed to link file');
      }
    } catch (err) {
      console.error("Link error:", err);
    }
  };

  const handleDelinkFileFromTask = async (file: any, task: any) => {
    if (!activeWorkspace) return;
    const updated = (task.attachments || []).filter((att: any) => att.url !== file.url);
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          workspaceId: activeWorkspace.id,
          attachments: updated
        })
      });
      if (res.ok) {
        fetchWorkspaceTasks();
      } else {
        alert('Failed to delink file');
      }
    } catch (err) {
      console.error("Delink error:", err);
    }
  };

  const handleDeleteChatFile = async (file: any) => {
    if (!activeConv || !activeWorkspace) return;
    const confirmDelete = confirm(`Are you sure you want to delete "${file.name}"?\n\nThis will completely delete the file from storage, remove it from any linked project stages, and delete the message from the chat history.`);
    if (!confirmDelete) return;

    try {
      // 1. Delink from any task/stage items it was linked to
      const linkedTasks = workspaceTasks.filter(t => (t.attachments || []).some((att: any) => att.url === file.url));
      for (const task of linkedTasks) {
        const updated = (task.attachments || []).filter((att: any) => att.url !== file.url);
        await fetch('/api/projects/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            workspaceId: activeWorkspace.id,
            attachments: updated
          })
        });
      }

      // 2. Delete the physical file from server
      const urlObj = new URL(file.url, window.location.origin);
      const savedName = urlObj.searchParams.get('name');
      if (savedName) {
        await fetch(`/api/files?name=${savedName}`, { method: 'DELETE' });
      }

      // 3. Delete the chat message completely
      const res = await fetch(`/api/chat/message?chatId=${activeConv.id}&messageId=${file.messageId}&completely=true`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== file.messageId));
        fetchWorkspaceTasks();
      } else {
        alert('Failed to remove the chat message');
      }
    } catch (err) {
      console.error("Delete file error:", err);
      alert('An error occurred during file deletion');
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeConv && e.dataTransfer.types.includes('Files')) {
      dragCounter.current++;
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeConv) {
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

  const sendChatMessageWithAttachment = async (data: any) => {
    if (!activeConv) return;
    const msgRes = await fetch('/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: activeConv.id,
        content: `Shared file: ${data.name}`,
        attachments: [{
          id: data.id || Math.random().toString(),
          name: data.name,
          url: data.url,
          mimeType: data.mimeType,
          size: data.size,
        }],
      }),
    });
    if (msgRes.ok) {
      const savedMsg = await msgRes.json();
      const normMsg = normalizeMessage(savedMsg);
      setMessages(prev => {
        if (prev.some(m => m.id === normMsg.id)) return prev;
        const updated = [...prev, normMsg];
        messagesRef.current = updated;
        return updated;
      });
      setTimeout(() => scrollToBottom('auto'), 20);
    }
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
  const renderMessageContent = (text: string) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts = text.split(urlRegex);
    if (parts.length === 1) {
      return text;
    }
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        const href = part.toLowerCase().startsWith('http') ? part : `https://${part}`;
        return (
          <span key={index} className="inline-flex items-center gap-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 px-2 py-0.5 rounded-lg border border-indigo-100/20 max-w-full my-0.5 align-middle select-text">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-400 font-semibold break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLinkingAttachment({
                  id: Math.random().toString(),
                  name: part.length > 40 ? part.slice(0, 40) + '...' : part,
                  url: href,
                  size: 0,
                  mimeType: 'text/html'
                });
              }}
              className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-white transition-all shrink-0"
              title="Link this link to a project stage item"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </span>
        );
      }
      return part;
    });
  };

  const executePendingUpload = async () => {
    if (!pendingUpload || !activeConv) return;
    const { files, name, isFolder } = pendingUpload;
    setPendingUpload(null);
    setSending(true);

    try {
      let data: any = null;

      if (isFolder) {
        setUploadProgress({ name, percent: 0 });
        data = await uploadFolder(files.map(f => ({ file: f.file, path: f.path || f.file.name })), name, {
          chatId: activeConv.id,
          onProgress: (event) => {
            setUploadProgress({ name, percent: event.percentage });
          }
        });
      } else {
        // Single file upload
        const file = files[0].file;
        setUploadProgress({ name: file.name, percent: 0 });

        data = await uploadFile(file, {
          chatId: activeConv.id,
          onProgress: (event) => {
            setUploadProgress({ name: file.name, percent: event.percentage });
          }
        });
      }

      await sendChatMessageWithAttachment(data);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Upload failed');
    } finally {
      setSending(false);
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeConv) {
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

  const fetchTasksForLink = async (projId: string) => {
    if (!activeWorkspace || !projId) {
      setProjectTasksForLink([]);
      return;
    }
    setLoadingTasksForLink(true);
    try {
      const res = await fetch(`/api/projects/tasks?workspaceId=${activeWorkspace.id}&projectId=${projId}`);
      if (res.ok) {
        setProjectTasksForLink(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTasksForLink(false);
    }
  };

  useEffect(() => {
    if (selectedProjectForLink) {
      fetchTasksForLink(selectedProjectForLink);
    } else {
      setProjectTasksForLink([]);
    }
  }, [selectedProjectForLink]);

  const handleLinkToStage = async (task: any) => {
    if (!linkingAttachment || !activeWorkspace) return;
    
    const existingAttachments = task.attachments || [];
    if (existingAttachments.some((att: any) => att.url === linkingAttachment.url)) {
      setLinkingSuccessMessage('This file is already attached to this stage!');
      setTimeout(() => setLinkingSuccessMessage(''), 2000);
      return;
    }
    
    const newAtt = {
      id: linkingAttachment.id || Math.random().toString(),
      name: linkingAttachment.name,
      url: linkingAttachment.url,
      size: linkingAttachment.size || 0,
      mimeType: linkingAttachment.mimeType || 'application/octet-stream'
    };
    
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          workspaceId: activeWorkspace.id,
          attachments: [...existingAttachments, newAtt]
        })
      });
      if (res.ok) {
        setLinkingSuccessMessage('Success! File linked to stage.');
        setTimeout(() => {
          setLinkingSuccessMessage('');
          setLinkingAttachment(null);
          setSelectedProjectForLink('');
          setProjectTasksForLink([]);
        }, 1500);
      } else {
        alert('Failed to link file');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to link file');
    }
  };

  const getConvDisplayName = (conv?: Conversation | null | undefined) => {
    if (!conv) return 'Conversation';
    if (conv.name) return conv.name;
    if (conv.type === 'direct' && conv.memberNames) {
      const otherId = conv.members.find(id => id !== user?.id);
      if (otherId) return conv.memberNames[otherId] ?? 'Unknown';
    }
    return 'Conversation';
  };

  // Reusable helper to retrieve linked CRM client for any conversation
  const getLinkedClientForConv = useCallback((conv: Conversation | null | undefined): Client | null => {
    if (!conv) return null;
    
    // 1. Check explicit manual override linkage
    const manualId = chatClientLinks[conv.id];
    if (manualId === 'none') {
      return null;
    }
    if (manualId) {
      const found = crmClients.find(c => c.id === manualId);
      if (found) return found;
    }

    // 2. Persistent clientId on the conversation
    if (conv.clientId) {
      const found = crmClients.find(c => c.id === conv.clientId);
      if (found) return found;
    }

    return null;
  }, [chatClientLinks, crmClients]);

  // Auto-detect linked client for WhatsApp Detail sidebar
  const activeLinkedClient = useMemo(() => {
    return getLinkedClientForConv(activeConv);
  }, [activeConv, getLinkedClientForConv]);

  // Helper to determine if a conversation is older than 3 months without recent activity
  const isOlderThan3Months = useCallback((conv?: Conversation | null): boolean => {
    if (!conv) return false;
    const dateStr = conv.lastMessageAt || conv.createdAt;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    return d.getTime() < cutoff.getTime();
  }, []);

  // Format the inactive duration text (e.g. "3mo+ inactive", "4mo+ inactive", "1y+ inactive")
  const getInactiveAgeText = useCallback((conv?: Conversation | null): string => {
    if (!conv) return 'Inactive';
    const dateStr = conv.lastMessageAt || conv.createdAt;
    if (!dateStr) return 'Inactive';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Inactive';
    const diffDays = Math.max(1, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
    const months = Math.floor(diffDays / 30);
    if (months >= 12) {
      const years = Math.floor(months / 12);
      return `${years}y+ inactive`;
    }
    if (months >= 3) {
      return `${months}mo+ inactive`;
    }
    return `${diffDays}d ago`;
  }, []);

  // Fetch client files from explorer
  const fetchClientFiles = async (clientId: string) => {
    if (!clientId) return;
    setLoadingClientFiles(true);
    try {
      const res = await fetch(`/api/admin/explorer?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setClientFiles(data.files || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClientFiles(false);
    }
  };

  useEffect(() => {
    if (activeLinkedClient) {
      fetchClientFiles(activeLinkedClient.id);
    } else {
      setClientFiles([]);
    }
  }, [activeLinkedClient]);

  // Filter linked data for Dossier Tabs
  const linkedProjects = useMemo(() => {
    if (!activeLinkedClient) return [];
    return crmProjects.filter(p => p.clientId === activeLinkedClient.id);
  }, [crmProjects, activeLinkedClient]);

  const linkedInvoices = useMemo(() => {
    if (!activeLinkedClient) return [];
    return crmInvoices.filter(i => i.clientId === activeLinkedClient.id);
  }, [crmInvoices, activeLinkedClient]);

  const linkedEvents = useMemo(() => {
    if (!activeLinkedClient) return [];
    const clientName = activeLinkedClient.companyName.toLowerCase();
    const contact = activeLinkedClient.contactPerson.toLowerCase();
    return crmEvents.filter(e => 
      e.title?.toLowerCase().includes(clientName) ||
      e.description?.toLowerCase().includes(clientName) ||
      e.title?.toLowerCase().includes(contact) ||
      e.description?.toLowerCase().includes(contact)
    );
  }, [crmEvents, activeLinkedClient]);

  const fetchMessages = useCallback(async (chatId: string, showLoader = false) => {
    // If we have cached messages in sessionStorage, hydrate them immediately
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(`cached_msgs_${chatId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setMessages(parsed);
          messagesRef.current = parsed;
          showLoader = false; // Do not show blocking spinner when cached msgs exist
        }
      } catch {}
    }

    if (showLoader) setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/chat/message?chatId=${chatId}`);
      if (res.ok) {
        const raw: ApiMessage[] = await res.json();
        const norms = raw.map(normalizeMessage);
        setMessages(norms);
        messagesRef.current = norms;
        try {
          sessionStorage.setItem(`cached_msgs_${chatId}`, JSON.stringify(norms));
        } catch {}
        setTimeout(() => scrollToBottom(), 80);
      }
    } catch { /* ignore */ }
    finally { if (showLoader) setLoadingMsgs(false); }
  }, [normalizeMessage, scrollToBottom]);

  // Request desktop notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Show HTML5 browser desktop notification
  const showDesktopNotification = useCallback((title: string, body: string, iconUrl?: string | null) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if (document.visibilityState === 'hidden') {
        try {
          new Notification(title, {
            body,
            icon: iconUrl || '/favicon.ico',
          });
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Connect to the Server-Sent Events (SSE) stream for real-time messages, presence and typing indicators
  useEffect(() => {
    if (!activeWorkspace) return;

    const eventSource = new EventSource('/api/chat/stream');

    eventSource.addEventListener('message', (e) => {
      try {
        const rawMsg: ApiMessage = JSON.parse(e.data);
        const normMsg = normalizeMessage(rawMsg);
        
        // 1. If message is for the active conversation
        if (activeConvIdRef.current === normMsg.chatId) {
          setMessages(prev => {
            if (prev.some(m => m.id === normMsg.id)) return prev;
            const updated = [...prev, normMsg];
            messagesRef.current = updated;
            return updated;
          });
          const isOwn = normMsg.senderId === userRef.current?.id;
          if (isOwn) {
            setTimeout(() => scrollToBottom('auto'), 20);
          } else if (isNearBottom()) {
            setTimeout(() => scrollToBottom('smooth'), 50);
          } else {
            setNewMessageNotice({
              chatId: normMsg.chatId,
              count: 1,
              senderName: normMsg.senderName,
            });
          }
        } else {
          // 2. If message is for a different conversation in the active workspace
          setConversations(prev => {
            return prev.map(c => {
              if (c.id === normMsg.chatId) {
                return {
                  ...c,
                  unreadCount: (c.unreadCount || 0) + 1,
                  lastMessage: normMsg.content,
                  lastMessageAt: normMsg.createdAt
                };
              }
              return c;
            }).sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
          });
        }

        // Notify user about incoming messages from other users
        if (normMsg.senderId !== userRef.current?.id) {
          playNotification();
          showDesktopNotification(
            `New message from ${normMsg.senderName}`,
            normMsg.content,
            normMsg.senderAvatar
          );
        }
      } catch (err) {
        console.error('SSE message parsing error:', err);
      }
    });

    eventSource.addEventListener('message_updated', (e) => {
      try {
        const rawMsg: ApiMessage = JSON.parse(e.data);
        const normMsg = normalizeMessage(rawMsg);
        if (activeConvIdRef.current === normMsg.chatId) {
          setMessages(prev => prev.map(m => m.id === normMsg.id ? normMsg : m));
        }
      } catch {}
    });

    eventSource.addEventListener('message_deleted', (e) => {
      try {
        const { messageId, chatId } = JSON.parse(e.data);
        if (activeConvIdRef.current === chatId) {
          setMessages(prev => prev.filter(m => m.id !== messageId));
        }
      } catch {}
    });

    eventSource.addEventListener('chat_created', (e) => {
      try {
        const rawConvo: ApiConversation = JSON.parse(e.data);
        const normConvo = normalizeConversation(rawConvo);
        setConversations(prev => {
          if (prev.some(c => c.id === normConvo.id)) return prev;
          return [normConvo, ...prev];
        });
      } catch {}
    });

    eventSource.addEventListener('chat_updated', (e) => {
      try {
        const rawConvo: ApiConversation = JSON.parse(e.data);
        const normConvo = normalizeConversation(rawConvo);
        setConversations(prev => prev.map(c => c.id === normConvo.id ? { ...c, ...normConvo } : c));
      } catch {}
    });

    eventSource.addEventListener('chat_deleted', (e) => {
      try {
        const { chatId } = JSON.parse(e.data);
        setConversations(prev => prev.filter(c => c.id !== chatId));
        if (activeConvIdRef.current === chatId) {
          setActiveConv(null);
        }
      } catch {}
    });

    eventSource.addEventListener('chat_cleared', (e) => {
      try {
        const { chatId } = JSON.parse(e.data);
        if (activeConvIdRef.current === chatId) {
          setMessages([]);
        }
      } catch {}
    });

    eventSource.addEventListener('typing', (e) => {
      try {
        const { chatId, userId, username, isTyping } = JSON.parse(e.data);
        if (activeConvIdRef.current === chatId) {
          setTypingUsers(prev => ({
            ...prev,
            [userId]: { username, isTyping }
          }));
        }
      } catch {}
    });

    eventSource.addEventListener('presence', (e) => {
      try {
        const { userId, status } = JSON.parse(e.data);
        setUsersById(prev => {
          if (!prev[userId]) return prev;
          return {
            ...prev,
            [userId]: {
              ...prev[userId],
              status,
            }
          };
        });
      } catch {}
    });

    eventSource.onerror = (err) => {
      console.warn('SSE connection error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, [activeWorkspace, normalizeMessage, normalizeConversation, showDesktopNotification, playNotification]);

  // Compute active typers list for rendering
  const typingDisplay = useMemo(() => {
    const activeTypers = Object.values(typingUsers).filter(t => t.isTyping);
    if (activeTypers.length === 0) return null;
    if (activeTypers.length === 1) return `${activeTypers[0].username} is typing...`;
    if (activeTypers.length === 2) return `${activeTypers[0].username} and ${activeTypers[1].username} are typing...`;
    return 'Multiple people are typing...';
  }, [typingUsers]);

  // Reset typing indicators when active conversation changes
  const lastTypingSentRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTypingUsers({});
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    lastTypingSentRef.current = 0;
  }, [activeConv]);

  // Handle active conversation load and state persistence
  useEffect(() => {
    if (activeConv) {
      activeConvIdRef.current = activeConv.id;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('last_active_chat_id', activeConv.id);
          const savedDraft = sessionStorage.getItem(`chat_draft_${activeConv.id}`);
          setInput(savedDraft || '');
        } catch {}
      }
      const hasCached = typeof window !== 'undefined' && !!sessionStorage.getItem(`cached_msgs_${activeConv.id}`);
      fetchMessages(activeConv.id, !hasCached);
    } else {
      activeConvIdRef.current = null;
      setMessages([]);
      messagesRef.current = [];
    }
  }, [activeConv?.id, fetchMessages]);

  // Persist input draft per active conversation
  useEffect(() => {
    if (activeConv?.id && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`chat_draft_${activeConv.id}`, input);
      } catch {}
    }
  }, [input, activeConv?.id]);

  // Persist active filter tab
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_chat_filter', activeFilterTab);
      } catch {}
    }
  }, [activeFilterTab]);

  // Send typing notification when input changes (throttled and clearable)
  useEffect(() => {
    if (!activeConv) return;

    if (!input.trim()) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (lastTypingSentRef.current > 0) {
        lastTypingSentRef.current = 0;
        fetch('/api/chat/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: activeConv.id, isTyping: false })
        }).catch(() => {});
      }
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      fetch('/api/chat/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeConv.id, isTyping: true })
      }).catch(() => {});
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (lastTypingSentRef.current > 0) {
        lastTypingSentRef.current = 0;
        fetch('/api/chat/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: activeConv.id, isTyping: false })
        }).catch(() => {});
      }
    }, 4000);

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [input, activeConv]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !user) return;

    if (editingMsg) {
      if (!editContent.trim()) return;
      try {
        const res = await fetch('/api/chat/message', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: activeConv.id,
            messageId: editingMsg.id,
            content: editContent.trim()
          }),
        });
        if (res.ok) {
          setEditingMsg(null); setEditContent('');
          const updatedMsg = await res.json();
          const normMsg = normalizeMessage(updatedMsg);
          setMessages(prev => prev.map(m => m.id === normMsg.id ? normMsg : m));
        }
      } catch { /* ignore */ }
      return;
    }

    if (!input.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          content: input.trim(),
          replyTo: replyingTo?.id || undefined,
        }),
      });
      if (res.ok) {
        const savedMsg = await res.json();
        const normMsg = normalizeMessage(savedMsg);
        setInput(''); setReplyingTo(null);
        setMessages(prev => {
          if (prev.some(m => m.id === normMsg.id)) return prev;
          const updated = [...prev, normMsg];
          messagesRef.current = updated;
          return updated;
        });
        setTimeout(() => scrollToBottom('auto'), 20);
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const handleFileUpload = async (file: File) => {
    if (!activeConv) return;
    setSending(true);
    setUploadProgress({ name: file.name, percent: 0 });
    try {
      const data = await uploadFile(file, {
        chatId: activeConv.id,
        onProgress: (event) => {
          setUploadProgress({ name: file.name, percent: event.percentage });
        }
      });

      // Send a chat message with the attachment metadata
      const msgRes = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          content: `Shared file: ${file.name}`,
          attachments: [{
            id: data.id || Math.random().toString(),
            name: file.name,
            url: data.url,
            mimeType: file.type,
            size: file.size,
          }],
        }),
      });
      if (msgRes.ok) {
        const savedMsg = await msgRes.json();
        const normMsg = normalizeMessage(savedMsg);
        setMessages(prev => {
          if (prev.some(m => m.id === normMsg.id)) return prev;
          const updated = [...prev, normMsg];
          messagesRef.current = updated;
          return updated;
        });
        setTimeout(() => scrollToBottom('auto'), 20);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Upload failed');
    }
    finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeConv) return;
    const confirmDelete = confirm("Are you sure you want to delete this message?");
    if (!confirmDelete) return;

    const completely = confirm("Do you want to COMPLETELY delete this message from the database and history?\n\n- Click 'OK' to completely delete it (it will disappear entirely).\n- Click 'Cancel' to soft-delete / redact it (it will show 'This message was deleted').");

    try {
      const res = await fetch(`/api/chat/message?chatId=${activeConv.id}&messageId=${msgId}&completely=${completely}`, { method: 'DELETE' });
      if (res.ok) {
        if (completely) {
          setMessages(prev => prev.filter(m => m.id !== msgId));
        } else {
          const updatedMsg = await res.json();
          const normMsg = normalizeMessage(updatedMsg);
          setMessages(prev => prev.map(m => m.id === normMsg.id ? normMsg : m));
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete message');
      }
    } catch { /* ignore */ }
  };



  const handleReaction = async (msgId: string, emoji: string) => {
    if (!activeConv) return;
    setShowEmojiPicker(null);
    try {
      await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msgId, action: 'reaction', emoji }),
      });
      fetchMessages(activeConv.id);
    } catch { /* ignore */ }
  };

  const handlePinMessage = async (msgId: string, currentPin: boolean) => {
    if (!activeConv) return;
    try {
      await fetch('/api/chat/message', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          messageId: msgId,
          pinned: !currentPin
        }),
      });
      fetchMessages(activeConv.id);
    } catch { /* ignore */ }
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    setCreatingChat(true);

    try {
      let participantId = '';
      if (newChatType === 'direct') {
        const clean = newChatUsername.trim().replace('@', '').toLowerCase();
        participantId = userIdByUsername[clean];
        if (!participantId) {
          alert('Username not found in workspace');
          setCreatingChat(false);
          return;
        }
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          type: newChatType,
          name: newChatType !== 'direct' ? newChatName.trim() : undefined,
          description: newChatType !== 'direct' ? newChatDescription.trim() : undefined,
          participants: newChatType === 'direct' 
            ? (participantId ? [participantId] : undefined) 
            : selectedParticipants,
        }),
      });
      if (res.ok) {
        const conv = normalizeConversation(await res.json());
        setShowNewChatModal(false);
        setNewChatUsername(''); setNewChatName(''); setNewChatDescription(''); setNewChatType('direct'); setSelectedParticipants([]);
        await fetchConversations();
        setActiveConv(conv);
        setMobileView('chat');
      } else {
        const d = await res.json();
        alert(d.error ?? 'Failed to create conversation');
      }
    } catch { alert('Network error'); }
    finally { setCreatingChat(false); }
  };

  const handleRenameChat = async () => {
    if (!activeConv || !editingChatName.trim()) return;
    setIsRenamingChat(true);
    try {
      const res = await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          action: 'rename',
          value: editingChatName.trim()
        })
      });
      if (res.ok) {
        const updated = await res.json();
        const norm = normalizeConversation(updated);
        setActiveConv(norm);
        setConversations(prev => prev.map(c => c.id === norm.id ? norm : c));
      } else {
        const d = await res.json();
        alert(d.error ?? 'Failed to rename conversation');
      }
    } catch {
      alert('Network error');
    } finally {
      setIsRenamingChat(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!activeConv) return;
    setIsSavingDescription(true);
    try {
      const res = await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          action: 'update_description',
          value: editingChatDescription.trim()
        })
      });
      if (res.ok) {
        const updated = await res.json();
        const norm = normalizeConversation(updated);
        setActiveConv(norm);
        setConversations(prev => prev.map(c => c.id === norm.id ? norm : c));
        alert('Description updated successfully');
      } else {
        const d = await res.json();
        alert(d.error ?? 'Failed to update description');
      }
    } catch {
      alert('Network error');
    } finally {
      setIsSavingDescription(false);
    }
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;

    setIsUploadingAvatar(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'avatar');

    try {
      const uploadRes = await fetch('/api/files', {
        method: 'POST',
        body: formData
      });
      if (!uploadRes.ok) {
        const d = await uploadRes.json();
        alert(d.error ?? 'Failed to upload avatar image');
        setIsUploadingAvatar(false);
        return;
      }

      const uploadData = await uploadRes.json();
      const imageUrl = uploadData.url;

      const actionRes = await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          action: 'update_avatar',
          value: imageUrl
        })
      });

      if (actionRes.ok) {
        const updated = await actionRes.json();
        const norm = normalizeConversation(updated);
        setActiveConv(norm);
        setConversations(prev => prev.map(c => c.id === norm.id ? norm : c));
        alert('Avatar updated successfully');
      } else {
        const d = await actionRes.json();
        alert(d.error ?? 'Failed to set conversation avatar');
      }
    } catch {
      alert('Network error during upload');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleClearChat = async () => {
    if (!activeConv || confirmPhraseInput !== 'CLEAR') return;
    setIsExecutingAction(true);
    try {
      const res = await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          action: 'clear'
        })
      });
      if (res.ok) {
        setShowClearConfirmModal(false);
        setConfirmPhraseInput('');
        setMessages([]);
        alert('Conversation messages cleared permanently');
      } else {
        const d = await res.json();
        alert(d.error ?? 'Failed to clear conversation');
      }
    } catch {
      alert('Network error');
    } finally {
      setIsExecutingAction(false);
    }
  };

  const handleDeleteChat = async () => {
    const target = convToDelete || activeConv;
    if (!target || confirmPhraseInput !== getConvDisplayName(target)) return;
    setIsExecutingAction(true);
    try {
      const res = await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: target.id,
          action: 'delete'
        })
      });
      if (res.ok) {
        setShowDeleteConfirmModal(false);
        setConvToDelete(null);
        setShowChatProfileModal(false);
        setConfirmPhraseInput('');
        if (activeConv?.id === target.id) {
          setActiveConv(null);
          setMessages([]);
        }
        await fetchConversations();
      } else {
        const d = await res.json();
        alert(d.error ?? 'Failed to delete conversation');
      }
    } catch {
      alert('Network error');
    } finally {
      setIsExecutingAction(false);
    }
  };

  const handleConfirmClientStatusChange = async () => {
    if (!clientStatusConfirm || !activeWorkspace) return;
    const { client, targetStatus } = clientStatusConfirm;
    setIsUpdatingClientStatus(true);
    try {
      const res = await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          workspaceId: activeWorkspace.id,
          status: targetStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update client status');
      }
      setCrmClients(prev => prev.map(c => c.id === client.id ? { ...c, status: targetStatus } : c));
      setClientStatusConfirm(null);
    } catch (err: any) {
      console.error('Error updating client status:', err);
      alert(err.message || 'Failed to update client status');
    } finally {
      setIsUpdatingClientStatus(false);
    }
  };

  const handleCreateClientChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatClient || !newClientChatName.trim() || !activeWorkspace) return;
    setCreatingClientChat(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          name: newClientChatName.trim(),
          type: newClientChatType,
          clientId: newChatClient.id,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create conversation');

      linkChatToClient(data.id, newChatClient.id);

      const formattedChat: Conversation = {
        id: data.id,
        workspaceId: data.workspaceId,
        name: data.name,
        type: data.isChannel ? 'channel' : (data.isGroup ? 'group' : 'direct'),
        avatar: data.avatar,
        description: data.description,
        creatorId: data.creatorId,
        members: data.participants || [],
        createdAt: data.createdAt,
        unreadCount: 0,
        clientId: data.clientId || newChatClient.id
      };

      // Created ON TOP of previous chats (deduplicated)
      setConversations(prev => {
        const deduped = prev.filter(c => c.id !== formattedChat.id);
        return [formattedChat, ...deduped];
      });
      setActiveConv(formattedChat);
      setNewChatClient(null);
      setNewClientChatName('');
      setMobileView('chat');
    } catch (err: any) {
      alert(err.message || 'Error creating chat for client');
    } finally {
      setCreatingClientChat(false);
    }
  };

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => {
        setHighlightedMessageId(prev => prev === messageId ? null : prev);
      }, 1500);
    }
  };

  const handleAddParticipant = async (participantId: string) => {
    if (!activeConv) return;
    try {
      const res = await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          action: 'add_participant',
          value: participantId
        })
      });
      if (res.ok) {
        const updated = await res.json();
        const norm = normalizeConversation(updated);
        setActiveConv(norm);
        setConversations(prev => prev.map(c => c.id === norm.id ? norm : c));
        setInviteSearchQuery('');
      } else {
        const d = await res.json();
        alert(d.error ?? 'Failed to add participant');
      }
    } catch {
      alert('Network error');
    }
  };

  const handleRemoveParticipant = async (participantId: string) => {
    if (!activeConv) return;
    const confirmMsg = participantId === user?.id 
      ? 'Are you sure you want to leave this chat?' 
      : 'Are you sure you want to remove this participant?';
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeConv.id,
          action: 'remove_participant',
          value: participantId
        })
      });
      if (res.ok) {
        const updated = await res.json();
        const norm = normalizeConversation(updated);
        
        if (participantId === user?.id) {
          setActiveConv(null);
          setShowChatProfileModal(false);
          await fetchConversations();
        } else {
          setActiveConv(norm);
          setConversations(prev => prev.map(c => c.id === norm.id ? norm : c));
        }
      } else {
        const d = await res.json();
        alert(d.error ?? 'Failed to remove participant');
      }
    } catch {
      alert('Network error');
    }
  };

  // Audio Recorder logic
  const startRecording = async () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
      setRecordedAudioFile(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice_memo_${Date.now()}.webm`, { type: 'audio/webm' });
        
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);
        setRecordedAudioFile(file);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch {
      alert('Could not start recording. Microphone permission may be blocked.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const handleSendVoiceMemo = async () => {
    if (!recordedAudioFile) return;
    await handleFileUpload(recordedAudioFile);
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setRecordedAudioFile(null);
  };

  const handleDiscardVoiceMemo = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setRecordedAudioFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setShowScrollDown(!near);
  };

  const tabCounts = useMemo(() => {
    const counts = {
      all: conversations.length,
      channels: 0,
      clients: 0,
      direct: 0,
      groups: 0,
      older: 0,
      inactive: 0,
    };

    conversations.forEach(c => {
      if (c.type === 'channel') counts.channels++;
      if (c.type === 'direct') counts.direct++;
      if (c.type === 'group') counts.groups++;
      const linked = getLinkedClientForConv(c);
      if (linked) {
        if (linked.status === 'inactive') {
          counts.inactive++;
        } else {
          counts.clients++;
        }
      }
      if (isOlderThan3Months(c)) counts.older++;
    });

    return counts;
  }, [conversations, getLinkedClientForConv, isOlderThan3Months]);

  const filteredConvs = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const seen = new Set<string>();
    const uniqueConvs = conversations.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    return uniqueConvs.filter(c => {
      if (query) {
        const nameMatch = getConvDisplayName(c).toLowerCase().includes(query);
        const clientMatch = Boolean(getLinkedClientForConv(c)?.companyName.toLowerCase().includes(query));
        const lastMsgMatch = Boolean(c.lastMessage?.toLowerCase().includes(query));
        if (!nameMatch && !clientMatch && !lastMsgMatch) return false;
      }

      if (activeFilterTab === 'channels') return c.type === 'channel';
      if (activeFilterTab === 'clients') {
        const linked = getLinkedClientForConv(c);
        return linked !== null && linked.status !== 'inactive';
      }
      if (activeFilterTab === 'inactive') {
        const linked = getLinkedClientForConv(c);
        return linked !== null && linked.status === 'inactive';
      }
      if (activeFilterTab === 'direct') return c.type === 'direct';
      if (activeFilterTab === 'groups') return c.type === 'group';
      if (activeFilterTab === 'older') return isOlderThan3Months(c);
      return true;
    });
  }, [conversations, searchQuery, activeFilterTab, getLinkedClientForConv, isOlderThan3Months, getConvDisplayName]);

  const {
    activeClientGroups,
    inactiveClientGroups,
    activeClientsWithoutChats,
    inactiveClientsWithoutChats
  } = useMemo(() => {
    const activeGroups: { client: Client; convs: Conversation[] }[] = [];
    const inactiveGroups: { client: Client; convs: Conversation[] }[] = [];
    const activeWithoutChats: Client[] = [];
    const inactiveWithoutChats: Client[] = [];
    const query = searchQuery.toLowerCase().trim();

    // Ensure unique clients by id
    const uniqueCrmClients = Array.from(new Map(crmClients.map(c => [c.id, c])).values());

    uniqueCrmClients.forEach(client => {
      const clientConvsMap = new Map<string, Conversation>();
      conversations.forEach(c => {
        const linked = getLinkedClientForConv(c);
        if (linked?.id === client.id) {
          clientConvsMap.set(c.id, c);
        }
      });
      const clientConvs = Array.from(clientConvsMap.values());

      const isInactive = client.status === 'inactive';

      if (clientConvs.length > 0) {
        if (query) {
          const clientMatches = client.companyName.toLowerCase().includes(query);
          const matchingConvs = clientConvs.filter(c =>
            getConvDisplayName(c).toLowerCase().includes(query) ||
            Boolean(c.lastMessage?.toLowerCase().includes(query))
          );
          if (clientMatches || matchingConvs.length > 0) {
            const group = {
              client,
              convs: clientMatches ? clientConvs : matchingConvs
            };
            if (isInactive) {
              inactiveGroups.push(group);
            } else {
              activeGroups.push(group);
            }
          }
        } else {
          const group = { client, convs: clientConvs };
          if (isInactive) {
            inactiveGroups.push(group);
          } else {
            activeGroups.push(group);
          }
        }
      } else {
        if (!query || client.companyName.toLowerCase().includes(query)) {
          if (isInactive) {
            inactiveWithoutChats.push(client);
          } else {
            activeWithoutChats.push(client);
          }
        }
      }
    });

    return {
      activeClientGroups: activeGroups,
      inactiveClientGroups: inactiveGroups,
      activeClientsWithoutChats: activeWithoutChats,
      inactiveClientsWithoutChats: inactiveWithoutChats
    };
  }, [crmClients, conversations, searchQuery, getLinkedClientForConv, getConvDisplayName]);

  // Filter active client groups by active clientTagFilter
  const filteredActiveClientGroups = useMemo(() => {
    if (clientTagFilter === 'all') return activeClientGroups;
    if (clientTagFilter === 'Untagged' || clientTagFilter === 'untagged') {
      return activeClientGroups.filter(({ client }) => !client.tags || client.tags.length === 0);
    }
    return activeClientGroups.filter(({ client }) => client.tags?.includes(clientTagFilter));
  }, [activeClientGroups, clientTagFilter]);

  // Filter active clients without chats by active clientTagFilter
  const filteredActiveClientsWithoutChats = useMemo(() => {
    if (clientTagFilter === 'all') return activeClientsWithoutChats;
    if (clientTagFilter === 'Untagged' || clientTagFilter === 'untagged') {
      return activeClientsWithoutChats.filter(client => !client.tags || client.tags.length === 0);
    }
    return activeClientsWithoutChats.filter(client => client.tags?.includes(clientTagFilter));
  }, [activeClientsWithoutChats, clientTagFilter]);

  // Filter inactive client groups by active clientTagFilter
  const filteredInactiveClientGroups = useMemo(() => {
    if (clientTagFilter === 'all') return inactiveClientGroups;
    if (clientTagFilter === 'Untagged' || clientTagFilter === 'untagged') {
      return inactiveClientGroups.filter(({ client }) => !client.tags || client.tags.length === 0);
    }
    return inactiveClientGroups.filter(({ client }) => client.tags?.includes(clientTagFilter));
  }, [inactiveClientGroups, clientTagFilter]);

  // Filter inactive clients without chats by active clientTagFilter
  const filteredInactiveClientsWithoutChats = useMemo(() => {
    if (clientTagFilter === 'all') return inactiveClientsWithoutChats;
    if (clientTagFilter === 'Untagged' || clientTagFilter === 'untagged') {
      return inactiveClientsWithoutChats.filter(client => !client.tags || client.tags.length === 0);
    }
    return inactiveClientsWithoutChats.filter(client => client.tags?.includes(clientTagFilter));
  }, [inactiveClientsWithoutChats, clientTagFilter]);

  // Client counts for tag pills across all CRM clients
  const allTagsWithClientCounts = useMemo(() => {
    const list: { tag: string; count: number }[] = [];
    customTags.forEach(tag => {
      const count = crmClients.filter(c => c.tags?.includes(tag)).length;
      list.push({ tag, count });
    });
    return list;
  }, [customTags, crmClients]);

  const untaggedClientsCount = useMemo(() => {
    return crmClients.filter(c => !c.tags || c.tags.length === 0).length;
  }, [crmClients]);

  const totalClientsCount = useMemo(() => {
    return crmClients.length;
  }, [crmClients]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatRecordingTime = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center liquid-card rounded-3xl p-8">
          <AlertCircle className="h-10 w-10 text-indigo-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">No Workspace Selected</h2>
          <p className="text-xs text-slate-500 mt-1">Select a workspace to view chats.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5.5rem)] overflow-hidden neu-raised rounded-[2.2rem] relative">
      {/* Conversations sidebar */}
      <div className={`${mobileView === 'chat' ? 'hidden' : 'flex'} lg:flex w-full lg:w-80 flex-col border-r border-slate-300/30 shrink-0`}>
        {/* Sidebar header */}
        <div className="p-4 border-b border-slate-300/30">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-black text-[#2d3748] flex-1 tracking-tight">Messages</h2>
            <button onClick={() => setShowNewChatModal(true)}
              className="neu-btn h-8 w-8 rounded-xl flex items-center justify-center text-[#466380]"
              title="New chat">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#718096] pointer-events-none" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2 neu-input rounded-2xl text-xs font-semibold text-[#2d3748] placeholder-[#94a3b8]"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>

          {/* Quick Filter Tabs (All, Channels, Clients, Direct, Groups) */}
          <div
            className="flex items-center gap-1 mt-2.5 overflow-x-auto no-scrollbar pb-0.5"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {filterTabOrder.map(tabId => {
              const ALL_TABS_CONFIG: Record<FilterTabId, { label: string; count: number; icon?: React.ComponentType<{ className?: string }> }> = {
                all: { label: 'All', count: tabCounts.all },
                channels: { label: 'Channels', count: tabCounts.channels, icon: Hash },
                clients: { label: 'Clients', count: tabCounts.clients, icon: Building2 },
                direct: { label: 'Direct', count: tabCounts.direct, icon: User },
                groups: { label: 'Groups', count: tabCounts.groups, icon: Users2 },
                older: { label: '>3 Months', count: tabCounts.older, icon: Clock },
                inactive: { label: 'Inactive', count: tabCounts.inactive, icon: UserX },
              };
              const tab = { id: tabId, ...ALL_TABS_CONFIG[tabId] };
              const isActive = activeFilterTab === tab.id;
              const isDragged = draggedTabId === tab.id;
              const isDragOver = dragOverTabId === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tab.id)}
                  onDragOver={(e) => handleTabDragOver(e, tab.id)}
                  onDragLeave={(e) => handleTabDragLeave(e, tab.id)}
                  onDrop={(e) => handleTabDrop(e, tab.id)}
                  onDragEnd={handleTabDragEnd}
                  onClick={() => {
                    if (isDraggingTabRef.current) return;
                    setActiveFilterTab(tab.id);
                  }}
                  title="Click to filter · Drag to rearrange"
                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold shrink-0 transition-all cursor-grab active:cursor-grabbing select-none ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-slate-700'
                  } ${isDragged ? 'opacity-30 scale-95' : ''} ${
                    isDragOver && !isDragged ? 'ring-2 ring-indigo-500 scale-105 shadow-xs' : ''
                  }`}
                >
                  <GripVertical className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity -ml-0.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  {Icon && <Icon className="h-3 w-3 shrink-0" />}
                  <span>{tab.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold ${
                    isActive
                      ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                      : 'bg-slate-200/80 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Collections & Tags Bar under Clients tab */}
        {activeFilterTab === 'clients' && (
          <div className="px-3 pt-2 pb-1.5 border-b border-slate-200/70 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 space-y-1.5 animate-in fade-in duration-150 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <Tag className="h-2.5 w-2.5 text-indigo-500" /> Collections & Tags
              </span>
              {clientTagFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setClientTagFilter('all')}
                  className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Reset to All
                </button>
              )}
            </div>

            {/* Horizontal scrollable pills with live counts */}
            <div
              className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 text-[10px]"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {/* All Pill */}
              <button
                type="button"
                onClick={() => setClientTagFilter('all')}
                className={`px-2 py-0.5 rounded-lg font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer flex items-center gap-1 border ${
                  clientTagFilter === 'all'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-2xs'
                    : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-350 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>All</span>
                <span className={`text-[8.5px] px-1.5 py-0.2 rounded-full font-bold ${
                  clientTagFilter === 'all'
                    ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {totalClientsCount}
                </span>
              </button>

              {/* Each Custom Tag Pill */}
              {allTagsWithClientCounts.map(({ tag, count }) => {
                const isSelected = clientTagFilter === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setClientTagFilter(tag)}
                    className={`px-2 py-0.5 rounded-lg font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer flex items-center gap-1 border ${
                      isSelected
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-2xs'
                        : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-350 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{getTagIcon(tag)}</span>
                    <span>{tag}</span>
                    <span className={`text-[8.5px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* Untagged Pill */}
              {untaggedClientsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setClientTagFilter('Untagged')}
                  className={`px-2 py-0.5 rounded-lg font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer flex items-center gap-1 border ${
                    clientTagFilter === 'Untagged'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-2xs'
                      : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-350 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>⚪</span>
                  <span>Untagged</span>
                  <span className={`text-[8.5px] px-1.5 py-0.2 rounded-full font-bold ${
                    clientTagFilter === 'Untagged'
                      ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {untaggedClientsCount}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Conversation list */}
        <div
          className="flex-1 overflow-y-auto no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {loadingConvs ? (
            <div className="flex items-center justify-center h-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : activeFilterTab === 'clients' ? (
            /* CLIENTS GROUPED VIEW (ACTIVE ONLY) */
            activeClientGroups.length === 0 && activeClientsWithoutChats.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-400 space-y-2">
                <Building2 className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No Active Clients Found</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Add clients in the Clients section or connect existing chats using the client selector.
                </p>
                {inactiveClientGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilterTab('inactive')}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer transition-all"
                  >
                    <UserX className="h-3.5 w-3.5 text-rose-500" />
                    <span>View {inactiveClientGroups.length} Inactive {inactiveClientGroups.length === 1 ? 'Client' : 'Clients'} ({tabCounts.inactive} chats)</span>
                  </button>
                )}
              </div>
            ) : filteredActiveClientGroups.length === 0 && filteredActiveClientsWithoutChats.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-400 space-y-2">
                <Tag className="h-7 w-7 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No Active Clients in "{clientTagFilter}"
                </p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  No active client chats match the selected collection tag.
                </p>
                {(filteredInactiveClientGroups.length > 0 || filteredInactiveClientsWithoutChats.length > 0) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setActiveFilterTab('inactive')}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer transition-all border border-amber-200 dark:border-amber-800"
                    >
                      <UserX className="h-3.5 w-3.5 text-amber-600" />
                      <span>View {filteredInactiveClientGroups.length + filteredInactiveClientsWithoutChats.length} Inactive {filteredInactiveClientGroups.length + filteredInactiveClientsWithoutChats.length === 1 ? 'Client' : 'Clients'} with this tag</span>
                    </button>
                  </div>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => setClientTagFilter('all')}
                    className="mt-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Show all clients
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredActiveClientGroups.map(({ client, convs }) => {
                  const isCollapsed = Boolean(collapsedClientIds[client.id]);
                  return (
                    <div key={client.id} className="pb-1">
                      {/* Client Section Header */}
                      <div
                        onClick={() => toggleClientCollapse(client.id)}
                        className="sticky top-0 z-10 px-3 py-2 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xs border-y border-slate-200/90 dark:border-slate-800 flex items-center justify-between gap-2 shadow-2xs cursor-pointer select-none hover:bg-slate-100/80 dark:hover:bg-slate-850/80 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleClientCollapse(client.id);
                            }}
                            className="p-0.5 -ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-transform shrink-0"
                            title={isCollapsed ? "Expand chats" : "Collapse chats"}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <div className="h-6 w-6 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs">
                            {client.companyName ? client.companyName[0].toUpperCase() : 'C'}
                          </div>

                          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-tight">
                              {client.companyName}
                            </p>
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                              {convs.length}
                            </span>
                            {client.tags && client.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                {client.tags.slice(0, 2).map(t => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center gap-0.5 text-[8.5px] px-1.5 py-0.2 rounded font-semibold bg-slate-200/50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-350"
                                  >
                                    <span>{getTagIcon(t)}</span>
                                    <span>{t}</span>
                                  </span>
                                ))}
                                {client.tags.length > 2 && (
                                  <span className="text-[8px] text-slate-400 font-semibold">+{client.tags.length - 2}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {/* + Create New Chat for this client */}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewChatClient(client);
                                setNewClientChatName(`${client.companyName} - Updates`);
                                setNewClientChatType('channel');
                              }}
                              className="h-6 px-2 rounded-lg bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-2xs shrink-0"
                              title={`Create new chat for ${client.companyName}`}
                            >
                              <Plus className="h-3 w-3" />
                              <span>New Chat</span>
                            </button>
                          )}

                          {/* 3-dots Menu for Client Actions (Mark Inactive) */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setClientMenuOpenId(clientMenuOpenId === client.id ? null : client.id)}
                              className="h-6 w-6 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              title="More Options"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {clientMenuOpenId === client.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-30"
                                  onClick={() => setClientMenuOpenId(null)}
                                />
                                <div className="absolute right-0 mt-1 w-36 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 animate-fade-in">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setClientMenuOpenId(null);
                                      setClientStatusConfirm({ client, targetStatus: 'inactive' });
                                    }}
                                    className="w-full px-3 py-1.5 text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer transition-colors"
                                  >
                                    <UserX className="h-3.5 w-3.5" />
                                    <span>Mark Inactive</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Client's chats (collapsible) */}
                      {!isCollapsed && (
                        <div className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                      {convs.map(conv => {
                        const otherId = conv.type === 'direct' ? conv.members.find(id => id !== user?.id) : undefined;
                        const otherAvatar = otherId ? usersById[otherId]?.avatar : null;
                        const isSelected = activeConv?.id === conv.id;
                        return (
                          <div
                            key={`${client.id}-${conv.id}`}
                            onClick={() => {
                              setConversations(prev => prev.map(item => item.id === conv.id ? { ...item, unreadCount: 0 } : item));
                              setNewMessageNotice(prev => prev?.chatId === conv.id ? null : prev);
                              setActiveConv({ ...conv, unreadCount: 0 });
                              setMobileView('chat');
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all group cursor-pointer border-l-[3.5px] ${
                              isSelected
                                ? 'bg-indigo-50/90 dark:bg-indigo-950/45 border-l-indigo-600 dark:border-l-indigo-400 shadow-2xs'
                                : 'border-l-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="relative shrink-0">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs overflow-hidden ${
                                conv.type === 'direct' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' :
                                conv.type === 'group' ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200' :
                                'bg-slate-150 text-slate-650 dark:bg-slate-800/40 dark:text-slate-400'
                              }`}>
                                {otherAvatar ? (
                                  <img src={otherAvatar} alt={getConvDisplayName(conv)} className="h-full w-full object-cover" />
                                ) : conv.avatar ? (
                                  <img src={conv.avatar} alt={getConvDisplayName(conv)} className="h-full w-full object-cover" />
                                ) : (
                                  conv.type === 'channel' ? <Hash className="h-4 w-4" /> :
                                  conv.type === 'group' ? <Users2 className="h-4 w-4" /> :
                                  getConvDisplayName(conv)[0]?.toUpperCase() ?? '?'
                                )}
                              </div>
                              {conv.type === 'direct' && otherId && usersById[otherId]?.status === 'online' && (
                                <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className={`text-xs truncate ${
                                  isSelected
                                    ? 'font-bold text-indigo-950 dark:text-indigo-200'
                                    : 'font-semibold text-slate-800 dark:text-slate-200'
                                }`}>
                                  {getConvDisplayName(conv)}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                  {Boolean(conv.unreadCount) && (
                                    <span className="min-w-4 h-4 px-1 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[9px] font-semibold flex items-center justify-center">
                                      {conv.unreadCount}
                                    </span>
                                  )}
                                  {conv.lastMessageAt && (
                                    <span className="text-[9px] text-slate-400">{formatTime(conv.lastMessageAt)}</span>
                                  )}
                                </div>
                              </div>
                              <p className={`text-[10px] truncate mt-0.5 ${
                                isSelected ? 'text-indigo-900/70 dark:text-indigo-300/70 font-medium' : 'text-slate-400'
                              }`}>
                                {conv.lastMessage ?? 'No messages yet'}
                              </p>
                            </div>

                            {/* Delete Chat Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConvToDelete(conv);
                                setConfirmPhraseInput('');
                                setShowDeleteConfirmModal(true);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-all shrink-0 cursor-pointer"
                              title={`Delete ${getConvDisplayName(conv)}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

                {/* Other CRM Clients (Option to create their first chat) */}
                {filteredActiveClientsWithoutChats.length > 0 && (
                  <div className="p-3 border-t border-slate-200/60 dark:border-slate-800/60 mt-2 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                      Other Active Clients ({filteredActiveClientsWithoutChats.length})
                    </p>
                    <div className="space-y-1">
                      {filteredActiveClientsWithoutChats.map(client => (
                        <div
                          key={client.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/50 dark:border-slate-800/50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <div className="h-6 w-6 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px] font-semibold shrink-0">
                              {client.companyName ? client.companyName[0].toUpperCase() : 'C'}
                            </div>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                              {client.companyName}
                            </span>
                            {client.tags && client.tags.length > 0 && (
                              <div className="flex items-center gap-1">
                                {client.tags.slice(0, 2).map(t => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center gap-0.5 text-[8.5px] px-1.5 py-0.2 rounded font-semibold bg-slate-200/50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-350"
                                  >
                                    <span>{getTagIcon(t)}</span>
                                    <span>{t}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setNewChatClient(client);
                                setNewClientChatName(`${client.companyName} - Discussion`);
                                setNewClientChatType('channel');
                              }}
                              className="px-2 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-[10px] font-semibold hover:opacity-90 flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Add Chat</span>
                            </button>

                            {/* 3-dots Menu for Client Actions (Mark Inactive) */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setClientMenuOpenId(clientMenuOpenId === `other-${client.id}` ? null : `other-${client.id}`)}
                                className="h-6 w-6 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                title="More Options"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>

                              {clientMenuOpenId === `other-${client.id}` && (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={() => setClientMenuOpenId(null)}
                                  />
                                  <div className="absolute right-0 mt-1 w-36 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 animate-fade-in">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setClientMenuOpenId(null);
                                        setClientStatusConfirm({ client, targetStatus: 'inactive' });
                                      }}
                                      className="w-full px-3 py-1.5 text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer transition-colors"
                                    >
                                      <UserX className="h-3.5 w-3.5" />
                                      <span>Mark Inactive</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inactive Client Chats Notice placed at the bottom */}
                {inactiveClientGroups.length > 0 && (
                  <div className="p-2.5 m-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserX className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <p className="text-[11px] font-medium text-amber-900 dark:text-amber-200 truncate">
                        {tabCounts.inactive} inactive client {tabCounts.inactive === 1 ? 'chat' : 'chats'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveFilterTab('inactive')}
                      className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 hover:underline shrink-0 cursor-pointer"
                    >
                      View Inactive →
                    </button>
                  </div>
                )}
              </div>
            )
          ) : activeFilterTab === 'inactive' ? (
            /* INACTIVE CLIENTS GROUPED VIEW */
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* Header Info Banner */}
              <div className="p-3 m-2.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40 text-xs">
                <div className="flex items-start gap-2.5">
                  <UserX className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-white text-[11px] leading-tight">
                      Inactive Client Chats ({tabCounts.inactive})
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Chats belonging to inactive clients are moved here out of your active workspace. You can review them, reactivate the client to restore them, or delete chats to clean up storage.
                    </p>
                  </div>
                </div>
              </div>

              {filteredInactiveClientGroups.length === 0 && filteredInactiveClientsWithoutChats.length === 0 ? (
                <div className="text-center py-10 px-4 text-slate-400 space-y-2">
                  <UserX className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {clientTagFilter === 'all' ? 'No Inactive Client Chats' : `No Inactive Clients in "${clientTagFilter}"`}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                    {clientTagFilter === 'all'
                      ? 'When an organization is marked inactive in your CRM, its chats will appear here for review, reactivating, or deletion.'
                      : 'No inactive clients or chats match the selected collection tag.'}
                  </p>
                </div>
              ) : (
                <>
                  {filteredInactiveClientGroups.map(({ client, convs }) => {
                    const isCollapsed = Boolean(collapsedClientIds[client.id]);
                    return (
                      <div key={client.id} className="pb-1">
                        {/* Inactive Client Header */}
                        <div
                          onClick={() => toggleClientCollapse(client.id)}
                          className="sticky top-0 z-10 px-3 py-2 bg-rose-50/70 dark:bg-rose-950/20 backdrop-blur-xs border-y border-rose-200/60 dark:border-rose-900/30 flex items-center justify-between gap-2 shadow-2xs cursor-pointer select-none hover:bg-rose-100/60 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleClientCollapse(client.id);
                              }}
                              className="p-0.5 -ml-1 text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 transition-transform shrink-0"
                              title={isCollapsed ? "Expand chats" : "Collapse chats"}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <div className="h-6 w-6 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {client.companyName ? client.companyName[0].toUpperCase() : 'C'}
                            </div>

                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-tight">
                                {client.companyName}
                              </p>
                              <span className="px-1.5 py-0.2 rounded-full text-[8px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-900/50">
                                Inactive
                              </span>
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-rose-100/70 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 shrink-0">
                                {convs.length}
                              </span>
                              {client.tags && client.tags.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {client.tags.slice(0, 2).map(t => (
                                    <span
                                      key={t}
                                      className="inline-flex items-center gap-0.5 text-[8.5px] px-1.5 py-0.2 rounded font-semibold bg-rose-100/80 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40"
                                    >
                                      <span>{getTagIcon(t)}</span>
                                      <span>{t}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {/* Reactivate Client Action */}
                            <button
                              type="button"
                              onClick={() => setClientStatusConfirm({ client, targetStatus: 'active' })}
                              className="h-6 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer border border-emerald-200 dark:border-emerald-800 shrink-0"
                              title={`Reactivate ${client.companyName}`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Reactivate</span>
                            </button>
                          </div>
                        </div>

                        {/* Client's Inactive Chats (collapsible) */}
                        {!isCollapsed && (
                          <div className="divide-y divide-slate-100/60 dark:divide-slate-800/40">
                        {convs.map(conv => {
                          const otherId = conv.type === 'direct' ? conv.members.find(id => id !== user?.id) : undefined;
                          const otherAvatar = otherId ? usersById[otherId]?.avatar : null;
                          const isSelected = activeConv?.id === conv.id;
                          return (
                            <div
                              key={`${client.id}-${conv.id}`}
                              onClick={() => {
                                setConversations(prev => prev.map(item => item.id === conv.id ? { ...item, unreadCount: 0 } : item));
                                setNewMessageNotice(prev => prev?.chatId === conv.id ? null : prev);
                                setActiveConv({ ...conv, unreadCount: 0 });
                                setMobileView('chat');
                              }}
                              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-all group cursor-pointer border-l-[3.5px] ${
                                isSelected
                                  ? 'bg-indigo-50/90 dark:bg-indigo-950/45 border-l-indigo-600 dark:border-l-indigo-400 shadow-2xs'
                                  : 'border-l-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <div className="relative shrink-0">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs overflow-hidden ${
                                  conv.type === 'direct' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' :
                                  conv.type === 'group' ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200' :
                                  'bg-slate-150 text-slate-650 dark:bg-slate-800/40 dark:text-slate-400'
                                }`}>
                                  {otherAvatar ? (
                                    <img src={otherAvatar} alt={getConvDisplayName(conv)} className="h-full w-full object-cover" />
                                  ) : conv.avatar ? (
                                    <img src={conv.avatar} alt={getConvDisplayName(conv)} className="h-full w-full object-cover" />
                                  ) : (
                                    conv.type === 'channel' ? <Hash className="h-4 w-4" /> :
                                    conv.type === 'group' ? <Users2 className="h-4 w-4" /> :
                                    getConvDisplayName(conv)[0]?.toUpperCase() ?? '?'
                                  )}
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className={`text-xs truncate ${
                                    isSelected
                                      ? 'font-bold text-indigo-950 dark:text-indigo-200'
                                      : 'font-semibold text-slate-800 dark:text-slate-200'
                                  }`}>
                                    {getConvDisplayName(conv)}
                                  </p>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                    {conv.lastMessageAt && (
                                      <span className="text-[9px] text-slate-400">{formatTime(conv.lastMessageAt)}</span>
                                    )}
                                  </div>
                                </div>
                                <p className={`text-[10px] truncate mt-0.5 ${
                                  isSelected ? 'text-indigo-900/70 dark:text-indigo-300/70 font-medium' : 'text-slate-400'
                                }`}>
                                  {conv.lastMessage ?? 'No messages yet'}
                                </p>
                              </div>

                              {/* Prominent Delete Chat Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConvToDelete(conv);
                                  setConfirmPhraseInput('');
                                  setShowDeleteConfirmModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-400 transition-all shrink-0 cursor-pointer"
                                title={`Delete ${getConvDisplayName(conv)}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

                  {/* Inactive CRM Clients without chats */}
                  {filteredInactiveClientsWithoutChats.length > 0 && (
                    <div className="p-3 border-t border-slate-200/60 dark:border-slate-800/60 mt-2 space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                        Inactive Clients Without Chats ({filteredInactiveClientsWithoutChats.length})
                      </p>
                      <div className="space-y-1">
                        {filteredInactiveClientsWithoutChats.map(client => (
                          <div
                            key={client.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/50 dark:border-slate-800/50 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <div className="h-6 w-6 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center text-[10px] font-semibold shrink-0">
                                {client.companyName ? client.companyName[0].toUpperCase() : 'C'}
                              </div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                                {client.companyName}
                              </span>
                              {client.tags && client.tags.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {client.tags.slice(0, 2).map(t => (
                                    <span
                                      key={t}
                                      className="inline-flex items-center gap-0.5 text-[8.5px] px-1.5 py-0.2 rounded font-semibold bg-rose-100/80 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40"
                                    >
                                      <span>{getTagIcon(t)}</span>
                                      <span>{t}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setClientStatusConfirm({ client, targetStatus: 'active' })}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[10px] font-semibold hover:bg-emerald-100 transition-all cursor-pointer"
                            >
                              Reactivate
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="text-center py-10 px-4 text-slate-400">
              {activeFilterTab === 'channels' ? (
                <div className="space-y-2">
                  <Hash className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Channels Found</p>
                  <button onClick={() => setShowNewChatModal(true)} className="mt-1 text-xs text-slate-900 dark:text-white font-bold underline">Create a channel</button>
                </div>
              ) : activeFilterTab === 'direct' ? (
                <div className="space-y-2">
                  <User className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Direct Messages</p>
                  <button onClick={() => setShowNewChatModal(true)} className="mt-1 text-xs text-slate-900 dark:text-white font-bold underline">Start a conversation</button>
                </div>
              ) : activeFilterTab === 'groups' ? (
                <div className="space-y-2">
                  <Users2 className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Group Chats</p>
                  <button onClick={() => setShowNewChatModal(true)} className="mt-1 text-xs text-slate-900 dark:text-white font-bold underline">Create a group</button>
                </div>
              ) : activeFilterTab === 'older' ? (
                <div className="space-y-2 py-4">
                  <Clock className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Chats Older Than 3 Months</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                    All your chats have had activity within the past 90 days. Chats inactive for over 3 months will appear here for review and cleanup.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs">No conversations yet</p>
                  <button onClick={() => setShowNewChatModal(true)} className="mt-1 text-xs text-slate-900 dark:text-white font-bold underline">Start one</button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {activeFilterTab === 'older' && (
                <div className="p-3 m-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-xs">
                  <div className="flex items-start gap-2.5">
                    <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 dark:text-white text-[11px] leading-tight">
                        Inactive Chats (&gt;3 Months)
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        These chats have had no activity for over 3 months. Review and delete obsolete chats to keep your inbox clutter-free.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {filteredConvs.map(conv => {
                const otherId = conv.type === 'direct' ? conv.members.find(id => id !== user?.id) : undefined;
                const otherAvatar = otherId ? usersById[otherId]?.avatar : null;
                const linkedClient = getLinkedClientForConv(conv);
                const isSelected = activeConv?.id === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setConversations(prev => prev.map(item => item.id === conv.id ? { ...item, unreadCount: 0 } : item));
                      setNewMessageNotice(prev => prev?.chatId === conv.id ? null : prev);
                      setActiveConv({ ...conv, unreadCount: 0 });
                      setMobileView('chat');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-all border-b border-slate-100/80 dark:border-slate-800/50 group cursor-pointer border-l-[3.5px] ${
                      isSelected
                        ? 'bg-indigo-50/90 dark:bg-indigo-950/45 border-l-indigo-600 dark:border-l-indigo-400 shadow-2xs'
                        : 'border-l-transparent hover:bg-slate-50/70 dark:hover:bg-slate-950'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden ${
                        conv.type === 'direct' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' :
                        conv.type === 'group' ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-bold' :
                        'bg-slate-150 text-slate-650 dark:bg-slate-800/40 dark:text-slate-400 font-bold'
                      }`}>
                        {otherAvatar ? (
                          <img src={otherAvatar} alt={getConvDisplayName(conv)} className="h-full w-full object-cover" />
                        ) : conv.avatar ? (
                          <img src={conv.avatar} alt={getConvDisplayName(conv)} className="h-full w-full object-cover" />
                        ) : (
                          conv.type === 'channel' ? <Hash className="h-4.5 w-4.5" /> :
                          conv.type === 'group' ? <Users2 className="h-4.5 w-4.5" /> :
                          getConvDisplayName(conv)[0]?.toUpperCase() ?? '?'
                        )}
                      </div>
                      {conv.type === 'direct' && otherId && usersById[otherId]?.status === 'online' && (
                        <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className={`text-xs truncate ${
                            isSelected
                              ? 'font-bold text-indigo-950 dark:text-indigo-200'
                              : 'font-semibold text-slate-800 dark:text-slate-200'
                          }`}>
                            {getConvDisplayName(conv)}
                          </p>
                          {conv.type === 'group' && (
                            <span className="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/40 dark:border-slate-700/40">Group</span>
                          )}
                          {conv.type === 'channel' && (
                            <span className="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/40 dark:border-slate-700/40">Channel</span>
                          )}
                          {linkedClient && (
                            <span
                              className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1 max-w-[110px]"
                              title={`Connected CRM Client: ${linkedClient.companyName}`}
                            >
                              <Building2 className="h-2.5 w-2.5 shrink-0 text-slate-500 dark:text-slate-400" />
                              <span className="truncate">{linkedClient.companyName}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-1">
                          {isOlderThan3Months(conv) && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {getInactiveAgeText(conv)}
                            </span>
                          )}
                          {Boolean(conv.unreadCount) && (
                            <span className="min-w-4 h-4 px-1 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[9px] font-black flex items-center justify-center">
                              {conv.unreadCount}
                            </span>
                          )}
                          {(conv.lastMessageAt || conv.createdAt) && (
                            <span className="text-[9px] text-slate-400">{formatTime(conv.lastMessageAt || conv.createdAt)}</span>
                          )}
                        </div>
                      </div>
                      <p className={`text-[10px] truncate mt-0.5 ${
                        isSelected ? 'text-indigo-900/70 dark:text-indigo-300/70 font-medium' : 'text-slate-400'
                      }`}>
                        {conv.lastMessage ?? 'No messages yet'}
                      </p>
                    </div>

                    {/* Delete button on hover (prominent in older tab) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConvToDelete(conv);
                        setConfirmPhraseInput('');
                        setShowDeleteConfirmModal(true);
                      }}
                      className={`${
                        activeFilterTab === 'older'
                          ? 'opacity-85 hover:opacity-100 text-rose-500 hover:text-rose-600 bg-rose-500/10 dark:bg-rose-500/20'
                          : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                      } p-1.5 rounded-lg transition-all shrink-0 cursor-pointer ml-1`}
                      title={`Delete ${getConvDisplayName(conv)}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div 
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`${mobileView === 'list' ? 'hidden' : 'flex'} lg:flex flex-1 flex-col min-w-0 relative bg-white dark:bg-slate-900 border-r border-slate-200/50 dark:border-slate-800/50`}
      >
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-sm border-2 border-dashed border-slate-700 m-4 rounded-3xl pointer-events-none">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3 animate-pulse">
              <Paperclip className="h-8 w-8 text-slate-800 dark:text-slate-100 animate-bounce" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Drop files here to share in this chat</p>
            </div>
          </div>
        )}
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">
            <div>
              <div className="h-16 w-16 rounded-2xl bg-slate-50 dark:bg-slate-950/20 flex items-center justify-center mx-auto mb-4">
                <Hash className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-705 dark:text-slate-300">Select a conversation</p>
              <p className="text-xs mt-1 text-slate-400 font-medium">Choose one from the sidebar or start a new chat</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setMobileView('list')} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="relative shrink-0">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden ${
                    activeConv.type === 'direct' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 font-black' :
                    activeConv.type === 'group' ? 'bg-indigo-100 text-indigo-750 dark:bg-indigo-950/40 dark:text-indigo-400' :
                    'bg-slate-150 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400'
                  }`}>
                    {(() => {
                      const otherId = activeConv.type === 'direct' ? activeConv.members.find(id => id !== user?.id) : undefined;
                      const otherAvatar = otherId ? usersById[otherId]?.avatar : null;
                      if (otherAvatar) return <img src={otherAvatar} alt={getConvDisplayName(activeConv)} className="h-full w-full object-cover" />;
                      if (activeConv.avatar) return <img src={activeConv.avatar} alt={getConvDisplayName(activeConv)} className="h-full w-full object-cover" />;
                      if (activeConv.type === 'channel') return <Hash className="h-4 w-4" />;
                      if (activeConv.type === 'group') return <Users2 className="h-4 w-4" />;
                      return getConvDisplayName(activeConv)[0]?.toUpperCase() ?? '?';
                    })()}
                  </div>
                  {activeConv.type === 'direct' && (() => {
                    const otherId = activeConv.members.find(id => id !== user?.id);
                    return otherId && usersById[otherId]?.status === 'online';
                  })() && (
                    <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{getConvDisplayName(activeConv)}</p>
                    {activeLinkedClient?.status === 'inactive' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
                        <UserX className="h-2.5 w-2.5" />
                        Inactive Client
                      </span>
                    )}
                    <button
                      onClick={() => setShowStoragePopover(!showStoragePopover)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-all cursor-pointer shadow-sm border border-slate-205/60 dark:border-slate-800 ${
                        showStoragePopover 
                          ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300'
                      }`}
                      title="View Shared Chat Storage & Files"
                    >
                      <Database className="h-2.5 w-2.5" />
                      {formatBytes(totalStorageBytes)}
                    </button>
                  </div>
                  <p className="text-[9px] font-semibold truncate text-slate-400">
                    {typingDisplay ? (
                      <span className="text-indigo-500 dark:text-indigo-400 animate-pulse">{typingDisplay}</span>
                    ) : activeConv.type === 'direct' ? (
                      (() => {
                        const otherId = activeConv.members.find(id => id !== user?.id);
                        const status = otherId ? usersById[otherId]?.status : 'offline';
                        return status === 'online' ? 'Online' : 'Offline';
                      })()
                    ) : (
                      `${activeConv.type} · ${activeConv.members.length} members`
                    )}
                  </p>
                </div>
              </div>

              {/* Chat action triggers: WhatsApp Detail view */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowClientSidebar(!showClientSidebar)}
                  className={`p-2 rounded-xl transition-all border ${
                    showClientSidebar
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm'
                      : 'hover:bg-slate-50 border-transparent text-slate-400'
                  }`}
                  title="Client Dashboard Workspace"
                >
                  <Building2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowPinnedMessagesModal(true)}
                  className={`p-2 rounded-xl transition-all border ${
                    showPinnedMessagesModal
                      ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm'
                      : 'hover:bg-slate-50 border-transparent text-slate-400 dark:hover:bg-slate-800'
                  }`}
                  title="Pinned Messages"
                >
                  <Pin className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingChatName(activeConv.name || '');
                    setEditingChatDescription(activeConv.description || '');
                    setShowChatProfileModal(true);
                  }}
                  className="p-2 rounded-xl transition-all border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-400"
                  title="View/Edit Chat Details"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Storage Popover Dropdown Card */}
            {showStoragePopover && (
              <div className="absolute top-14 left-4 z-50 w-[22rem] max-h-[75vh] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl shadow-2xl p-4 flex flex-col gap-3.5 overflow-hidden">
                <div className="flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">Chat Storage</span>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[9px] font-black rounded-lg">
                      {formatBytes(totalStorageBytes)}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowStoragePopover(false)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Categories Tab switcher */}
                <div className="flex gap-1 bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800/40 shrink-0">
                  {([
                    { id: 'all', label: 'All' },
                    { id: 'images', label: 'Images' },
                    { id: 'docs', label: 'Docs' },
                    { id: 'media', label: 'Media' },
                    { id: 'others', label: 'Others' }
                  ] as const).map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setStorageCategoryTab(cat.id)}
                      className={`flex-1 text-[10px] font-bold py-1 rounded-lg transition-all capitalize ${
                        storageCategoryTab === cat.id
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-500 hover:text-slate-850 dark:hover:text-slate-350'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* File list scrollable panel */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 min-h-0">
                  {filteredChatFiles.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic text-[10px]">
                      No files found in this category.
                    </div>
                  ) : (
                    filteredChatFiles.map((file, idx) => {
                      const fileLinkedTasks = workspaceTasks.filter(t => (t.attachments || []).some((att: any) => att.url === file.url));
                      const isImage = file.mimeType.startsWith('image/');
                      const isDoc = file.mimeType.startsWith('text/') || file.mimeType === 'application/pdf';
                      const isMedia = file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/');

                      return (
                        <div key={idx} className="bg-slate-50/50 dark:bg-slate-955/20 border border-slate-200/40 dark:border-slate-805 p-3 rounded-2xl flex flex-col gap-2 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-955/35">
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-8.5 w-8.5 bg-white dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                                {isImage ? (
                                  <ImageIcon className="h-4.5 w-4.5 text-slate-500" />
                                ) : isDoc ? (
                                  <FileText className="h-4.5 w-4.5 text-slate-550" />
                                ) : isMedia ? (
                                  <Play className="h-4.5 w-4.5 text-slate-500" />
                                ) : (
                                  <Paperclip className="h-4.5 w-4.5 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                {downloadProgresses[file.id] !== undefined ? (
                                  <span className="text-[10px] font-bold text-indigo-650 dark:text-indigo-400 animate-pulse block">
                                    Downloading: {downloadProgresses[file.id]}%
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => triggerFileDownload(file.url, file.name, file.id)}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, file)}
                                    className="font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate block text-[11px] text-left"
                                    title={file.name}
                                  >
                                    {file.name}
                                  </button>
                                )}
                                <p className="text-[9px] text-slate-400 mt-0.5">
                                  {formatBytes(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteChatFile(file)}
                              className="p-1 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-955/20 text-slate-400 rounded-lg transition-all shrink-0"
                              title="Delete physical file to release storage"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Task linking associations */}
                          <div className="border-t border-slate-100 dark:border-slate-800/60 pt-2 space-y-2">
                            {/* Linked task badges */}
                            {fileLinkedTasks.length > 0 && (
                              <div className="space-y-1">
                                {fileLinkedTasks.map(task => (
                                  <div key={task.id} className="flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/20 px-2 py-1 rounded-xl text-[9px]">
                                    <span className="font-semibold text-indigo-750 dark:text-indigo-450 truncate pr-2 flex items-center gap-1">
                                      <FolderKanban className="h-3 w-3 text-indigo-500" />
                                      Linked: {task.title}
                                    </span>
                                    <button
                                      onClick={() => handleDelinkFileFromTask(file, task)}
                                      className="p-0.5 text-slate-400 hover:text-red-500 transition-all rounded"
                                      title="Delink file from this project task item"
                                    >
                                      <Unlink className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Dropdown task selector to link */}
                            <div className="relative">
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleLinkFileToTask(file, e.target.value);
                                  }
                                }}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 px-2.5 py-1.5 rounded-xl text-[9px] text-slate-500 dark:text-slate-400 focus:outline-none shadow-sm cursor-pointer"
                              >
                                <option value="">Link file with project stage item...</option>
                                {crmProjects.map(proj => {
                                  const projTasks = workspaceTasks.filter(t => t.projectId === proj.id);
                                  if (projTasks.length === 0) return null;
                                  return (
                                    <optgroup key={proj.id} label={proj.name}>
                                      {projTasks.map(t => (
                                        <option key={t.id} value={t.id}>{t.title}</option>
                                      ))}
                                    </optgroup>
                                  );
                                })}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Messages list */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/10"
            >
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <p className="text-xs">No messages yet. Say hello! 👋</p>
                </div>
              ) : messages.map(msg => {
                const isOwn = msg.senderId === user?.id;
                const canDelete = isOwn || isWorkspaceAdminOrOwner || isConvoAdmin;
                const isHighlighted = msg.id === highlightedMessageId;
                return (
                  <div id={`message-${msg.id}`} key={msg.id} className={`flex gap-2.5 group transition-all duration-500 ${isOwn ? 'flex-row-reverse' : ''} ${isHighlighted ? 'scale-[1.01]' : ''}`}>
                    {/* Avatar */}
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-1 overflow-hidden ${
                      isOwn ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {msg.senderAvatar ? (
                        <img src={msg.senderAvatar} alt={msg.senderName} className="h-full w-full object-cover" />
                      ) : (
                        msg.senderName[0]?.toUpperCase() ?? '?'
                      )}
                    </div>

                    {/* Bubble */}
                    <div className="max-w-[70%] flex flex-col">
                      <div className={`flex items-center gap-1.5 mb-1 text-[9px] text-slate-450 ${isOwn ? 'flex-row-reverse' : ''}`}>
                        <span className="font-bold">{msg.senderName}</span>
                        <span>{formatTime(msg.createdAt)}</span>
                      </div>
                      
                      <div className={`p-3 rounded-2xl text-xs relative border shadow-sm transition-all duration-500 ${
                        isOwn ? 'rounded-tr-none font-medium' : 'rounded-tl-none'
                      } ${isHighlighted 
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-500/30 shadow-md scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200/50 dark:border-slate-800'
                      }`}>
                        
                        {/* reply context link */}
                        {msg.replyTo && (
                          <div
                            onClick={() => scrollToMessage(msg.replyTo!)}
                            className="px-2.5 py-1.5 border-l-2 rounded-lg text-[10px] mb-2 truncate bg-slate-50 dark:bg-slate-950/40 border-slate-350 dark:border-slate-700 text-slate-550 dark:text-slate-400 font-normal cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-all select-none"
                            title="Scroll to parent message"
                          >
                            {messages.find(m => m.id === msg.replyTo)?.content ?? 'Original Message'}
                          </div>
                        )}

                        <p className="leading-relaxed whitespace-pre-wrap">{renderMessageContent(msg.content)}</p>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-3.5 space-y-2">
                            {msg.attachments.map(att => {
                              const isImg = att.mimeType?.startsWith('image/');
                              const isAud = att.mimeType?.startsWith('audio/');
                              return (
                                <div key={att.id} className="rounded-xl overflow-hidden border border-slate-200/40 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 p-2.5">
                                  {isImg ? (
                                    <div className="block w-full text-left">
                                      <button onClick={() => setViewingFile(att)} className="block w-full text-left">
                                        <img src={att.url} alt={att.name} className="max-h-40 rounded-lg object-cover max-w-full hover:opacity-90 transition-opacity" />
                                      </button>
                                      <div className="flex items-center justify-between mt-2.5 min-w-0">
                                        <span className="text-[10px] text-slate-400 truncate block font-semibold pr-2">{att.name}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {downloadProgresses[att.id] !== undefined ? (
                                            <span className="text-[9px] font-black text-indigo-650 dark:text-indigo-400 animate-pulse px-1">{downloadProgresses[att.id]}%</span>
                                          ) : (
                                            <button
                                              onClick={() => triggerFileDownload(att.url, att.name, att.id)}
                                              draggable
                                              onDragStart={(e) => handleDragStart(e, att)}
                                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 rounded transition-all animate-fade-in"
                                              title="Download file"
                                            >
                                              <Download className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                          <button
                                            onClick={() => {
                                              setLinkingAttachment(att);
                                              if (crmProjects.length > 0) {
                                                setSelectedProjectForLink(crmProjects[0].id);
                                              }
                                            }}
                                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-450 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-all"
                                            title="Link file to a Project Stage"
                                          >
                                            <FolderKanban className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : isAud ? (
                                    <div className="space-y-1.5 max-w-full overflow-hidden">
                                      <div className="flex items-center justify-between gap-2">
                                        <audio controls src={att.url} className="max-w-[180px] h-8" />
                                        <button
                                          onClick={() => {
                                            setLinkingAttachment(att);
                                            if (crmProjects.length > 0) {
                                              setSelectedProjectForLink(crmProjects[0].id);
                                            }
                                          }}
                                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-455 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-all shrink-0"
                                          title="Link file to a Project Stage"
                                        >
                                          <FolderKanban className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                      <span className="text-[9px] text-slate-400 truncate block font-bold">{att.name}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-3 text-[10px]">
                                      <span className="truncate font-semibold text-slate-505">{att.name}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {downloadProgresses[att.id] !== undefined ? (
                                          <span className="text-[9px] font-black text-indigo-650 dark:text-indigo-400 animate-pulse px-1">{downloadProgresses[att.id]}%</span>
                                        ) : (
                                          <button
                                            onClick={() => triggerFileDownload(att.url, att.name, att.id)}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, att)}
                                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 rounded transition-all"
                                            title="Download file"
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => {
                                            setLinkingAttachment(att);
                                            if (crmProjects.length > 0) {
                                              setSelectedProjectForLink(crmProjects[0].id);
                                            }
                                          }}
                                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-455 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-all"
                                          title="Link file to a Project Stage"
                                        >
                                          <FolderKanban className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Reactions strip */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(msg.reactions).map(([emoji, users]) => (
                              <span key={emoji} className="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/50 rounded-lg text-[9px] font-bold">
                                {emoji} {users.length}
                              </span>
                            ))}
                          </div>
                        )}

                      </div>

                      {/* Hover / Actions bar */}
                      <div className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? 'justify-end' : ''}`}>
                        <button onClick={() => setReplyingTo(msg)} className="p-1 text-slate-400 hover:text-slate-650 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Reply">
                          <Reply className="h-3 w-3" />
                        </button>
                        <button onClick={() => handlePinMessage(msg.id, !!msg.pinned)} className={`p-1 rounded ${msg.pinned ? 'text-indigo-500' : 'text-slate-400'} hover:bg-slate-100 dark:hover:bg-slate-800`} title={msg.pinned ? 'Unpin' : 'Pin'}>
                          <Pin className="h-3 w-3" />
                        </button>
                        {isOwn && (
                          <button onClick={() => { setEditingMsg(msg); setEditContent(msg.content); }} className="p-1 text-slate-400 hover:text-slate-650 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Edit">
                            <Edit2 className="h-3 w-3" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDeleteMessage(msg.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title={isOwn ? "Delete" : "Delete Message (Admin / Owner)"}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        
                        {/* Reaction Picker overlay */}
                        <div className="relative">
                          <button onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                            className="p-1 text-slate-400 hover:text-slate-650 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="React">
                            <Smile className="h-3 w-3" />
                          </button>
                          {showEmojiPicker === msg.id && (
                            <div className={`absolute z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2 flex gap-1.5 flex-wrap w-40 ${isOwn ? 'right-0' : 'left-0'}`}>
                              {EMOJI_LIST.map(em => (
                                <button key={em} onClick={() => handleReaction(msg.id, em)}
                                  className="text-lg hover:scale-125 transition-transform">
                                  {em}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* New message / scroll to bottom button */}
            {(showScrollDown || newMessageNotice) && (
              <button
                onClick={() => {
                  if (newMessageNotice && newMessageNotice.chatId !== activeConv.id) {
                    const target = conversations.find(conv => conv.id === newMessageNotice.chatId);
                    if (target) {
                      setConversations(prev => prev.map(item => item.id === target.id ? { ...item, unreadCount: 0 } : item));
                      setActiveConv({ ...target, unreadCount: 0 });
                      setMobileView('chat');
                    }
                  } else {
                    scrollToBottom('smooth');
                  }
                }}
                className="absolute bottom-24 right-6 z-20 flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all text-xs font-bold"
              >
                {newMessageNotice ? (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    {newMessageNotice.count} new from {newMessageNotice.senderName}
                  </>
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </button>
            )}

            {/* Reply preview bar */}
            {replyingTo && (
              <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 border-t border-indigo-200/50 dark:border-indigo-900/30 flex items-center gap-3 shrink-0">
                <Reply className="h-3.5 w-3.5 text-indigo-500" />
                <p className="flex-1 text-[10px] text-slate-600 dark:text-slate-400 truncate">Replying to: {replyingTo.content.slice(0, 80)}</p>
                <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600 transition-all">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Edit bar */}
            {editingMsg && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-955/20 border-t border-amber-200/50 dark:border-amber-900/30 flex items-center gap-3 shrink-0">
                <Edit2 className="h-3.5 w-3.5 text-amber-500" />
                <p className="flex-1 text-[10px] text-slate-600 dark:text-slate-400">Editing message</p>
                <button onClick={() => { setEditingMsg(null); setEditContent(''); }} className="text-slate-400 hover:text-slate-600 transition-all">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
                    {/* Upload progress banner */}
            {(uploadProgress || zipProgress !== null) && (
              <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-955/20 border-t border-indigo-200/50 dark:border-indigo-900/30 flex items-center gap-3 shrink-0 text-xs animate-fade-in">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100">
                    <span className="truncate">
                      {zipProgress !== null 
                        ? `Compressing folder locally: ${zipProgress}%`
                        : uploadProgress?.percent === 100 
                          ? 'Saving file on server...' 
                          : `Uploading: ${uploadProgress?.name || ''}`}
                    </span>
                    <span>{zipProgress !== null ? zipProgress : (uploadProgress?.percent ?? 0)}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-850 h-1 rounded-full overflow-hidden mt-1.5">
                    <div 
                      className={`h-full bg-indigo-650 transition-all duration-150 ${(zipProgress === 100 || uploadProgress?.percent === 100) ? 'animate-pulse' : ''}`} 
                      style={{ width: `${zipProgress !== null ? zipProgress : (uploadProgress?.percent ?? 0)}%` }} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Input area */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800/80 shrink-0">
              {isRecording ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-2xl">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex-1">Recording… {formatRecordingTime(recordingTime)}</span>
                  <button type="button" onClick={stopRecording} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-semibold transition-all">
                    <StopCircle className="h-3.5 w-3.5" /> Stop Recording
                  </button>
                </div>
              ) : recordedAudioUrl ? (
                <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/30 rounded-2xl">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">Preview Memo:</span>
                  <div className="flex-1 max-w-full overflow-hidden flex items-center">
                    <audio src={recordedAudioUrl} controls className="h-8 max-w-full" />
                  </div>
                  <button type="button" onClick={handleDiscardVoiceMemo} className="p-2 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-650 rounded-xl transition-all shrink-0" title="Discard memo">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={handleSendVoiceMemo} className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shrink-0" title="Send memo">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : isReadOnly ? (
                <div className="flex items-center justify-center gap-2 p-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center text-xs font-semibold text-slate-500 dark:text-slate-400 shadow-2xs">
                  <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>View-only mode: You have read-only access to chats in this workspace.</span>
                </div>
              ) : (
                <form onSubmit={handleSend} className="flex items-end gap-2">
                  {/* Attach */}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-655 dark:text-slate-400 shrink-0 transition-all" title="Attach file">
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files?.[0]) {
                        setPendingUpload({
                          files: [{ file: e.target.files[0] }],
                          name: e.target.files[0].name,
                          isFolder: false
                        });
                      }
                    }}
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
                  />

                  {/* Voice memo */}
                  <button type="button" onClick={startRecording}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-655 dark:text-slate-400 shrink-0 transition-all" title="Record voice memo">
                    <Mic className="h-4 w-4" />
                  </button>

                  {/* Text input */}
                  <div className="flex-1 relative">
                    <textarea
                      rows={1}
                      value={editingMsg ? editContent : input}
                      onChange={e => editingMsg ? setEditContent(e.target.value) : setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onPaste={(e) => {
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
                      }}
                      placeholder={editingMsg ? 'Edit message…' : 'Type a message…'}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-800 dark:text-slate-200 resize-none max-h-32"
                      style={{ minHeight: '42px' }}
                    />
                  </div>

                  {/* Send */}
                  <button
                    type="submit"
                    disabled={sending || (editingMsg ? !editContent.trim() : !input.trim())}
                    className="p-2.5 bg-slate-900 dark:bg-slate-100 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white dark:text-slate-900 rounded-xl shrink-0 transition-all"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {/* WHATSAPP-STYLE RIGHT SIDE CLIENT WORKSPACE SIDEBAR */}
      {activeConv && showClientSidebar && (
        <div className="fixed lg:absolute xl:relative right-0 top-0 lg:top-auto bottom-0 w-80 z-30 lg:z-10 border-l border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 h-full flex flex-col shrink-0 overflow-hidden shadow-xl xl:shadow-none animate-slide-in">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-150/80 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-955/10">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-450 flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> Client Workspace Peek
            </span>
            <button
              onClick={() => setShowClientSidebar(false)}
              className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Selector override for manual linkages */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-1.5 shrink-0">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Associated CRM Client Profile</p>
            <select
              value={activeLinkedClient?.id || ''}
              onChange={e => linkChatToClient(activeConv.id, e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] focus:outline-none"
            >
              <option value="">(No Linked Client - Unlinked)</option>
              {crmClients.map(c => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
          </div>

          {/* Dossier contents wrapper */}
          {!activeLinkedClient ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Users2 className="h-10 w-10 mb-2" />
              <p className="text-xs font-bold">No Client Profile Connected</p>
              <p className="text-[9px] mt-1">Please select an organization profile from the dropdown above to pull associated project files, calendars, and billings.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Profile Card Summary */}
              <div className="p-5 text-center shrink-0 border-b border-slate-100 dark:border-slate-800">
                <div className="h-14 w-14 rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center text-lg font-black mx-auto shadow-md">
                  {activeLinkedClient.companyName.charAt(0).toUpperCase()}
                </div>
                <h3 className="text-sm font-semibold text-slate-850 dark:text-slate-100 mt-3">{activeLinkedClient.companyName}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Contact: {activeLinkedClient.contactPerson}</p>
                <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[9px] px-2 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/50 text-slate-500 rounded-full font-semibold capitalize">
                    {activeLinkedClient.industry || 'General Client'}
                  </span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                    activeLinkedClient.status === 'inactive'
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-900/50'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${activeLinkedClient.status === 'inactive' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    {activeLinkedClient.status === 'inactive' ? 'Inactive' : 'Active'}
                  </span>
                </div>
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => setClientStatusConfirm({
                      client: activeLinkedClient,
                      targetStatus: activeLinkedClient.status === 'inactive' ? 'active' : 'inactive'
                    })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-semibold transition-all cursor-pointer ${
                      activeLinkedClient.status === 'inactive'
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {activeLinkedClient.status === 'inactive' ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        <span>Reactivate Client</span>
                      </>
                    ) : (
                      <>
                        <UserX className="h-3 w-3" />
                        <span>Mark as Inactive</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Tabs list inside drawer */}
              <div className="px-2 py-1 bg-slate-50 dark:bg-slate-955/20 border-b border-slate-150/40 dark:border-slate-800/40 shrink-0 flex gap-0.5 overflow-x-auto text-[9px] font-bold uppercase tracking-wider">
                {(['info', 'projects', 'billing', 'files', 'events'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSidebarTab(tab)}
                    className={`px-2.5 py-1.5 rounded-lg transition-all capitalize shrink-0 ${
                      sidebarTab === tab
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-350'
                    }`}
                  >
                    {tab === 'info' ? 'About' : tab === 'events' ? 'Calendar' : tab}
                  </button>
                ))}
              </div>

              {/* Scrollable tab content panel */}
              <div className="flex-1 overflow-y-auto p-4 text-xs">
                
                {/* 1. ABOUT INFO TAB */}
                {sidebarTab === 'info' && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2">
                      <Mail className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Email</p>
                        {activeLinkedClient.email ? (
                          <a href={`mailto:${activeLinkedClient.email}`} className="font-semibold truncate block hover:underline text-slate-750 dark:text-slate-150">
                            {activeLinkedClient.email}
                          </a>
                        ) : '—'}
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Phone className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Phone</p>
                        <p className="font-semibold text-slate-750 dark:text-slate-150">{activeLinkedClient.phone || '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Globe className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Website</p>
                        {activeLinkedClient.website ? (
                          <a href={activeLinkedClient.website.startsWith('http') ? activeLinkedClient.website : `https://${activeLinkedClient.website}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline flex items-center gap-1 text-slate-750 dark:text-slate-150">
                            {activeLinkedClient.website} <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : '—'}
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">Address</p>
                        <p className="font-semibold text-slate-750 dark:text-slate-200">{activeLinkedClient.address || '—'}</p>
                      </div>
                    </div>

                    {activeLinkedClient.notes && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mb-1">Dossier Notes</p>
                        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{activeLinkedClient.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. PROJECTS LIST TAB */}
                {sidebarTab === 'projects' && (
                  <div className="space-y-3">
                    {linkedProjects.length === 0 ? (
                      <p className="text-center text-slate-400 py-6 text-[11px]">No active projects linked</p>
                    ) : (
                      linkedProjects.map(proj => (
                        <div key={proj.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-150/40 dark:border-slate-800/40 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-slate-150 truncate max-w-[160px]">{proj.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-semibold capitalize">{proj.status}</span>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] text-slate-450 font-bold">
                              <span>Progress</span>
                              <span>{proj.progress}%</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-900 dark:bg-white" style={{ width: `${proj.progress}%` }} />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 3. BILLING INVOICES TAB */}
                {sidebarTab === 'billing' && (
                  <div className="space-y-2.5">
                    {linkedInvoices.length === 0 ? (
                      <p className="text-center text-slate-400 py-6 text-[11px]">No invoice records found</p>
                    ) : (
                      linkedInvoices.map(inv => (
                        <div key={inv.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-150/40 dark:border-slate-805 rounded-xl flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-100">Invoice {inv.invoiceNumber}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">Due: {inv.dueDate}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-slate-900 dark:text-white">${inv.total.toLocaleString()}</p>
                            <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-1.5 rounded mt-1 ${
                              inv.status === 'paid' ? 'bg-green-50 text-green-700' :
                              inv.status === 'overdue' ? 'bg-red-50 text-red-650' :
                              'bg-amber-50 text-amber-600'
                            }`}>{inv.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 4. CLIENT FILES STORAGE TAB */}
                {sidebarTab === 'files' && (
                  <div className="space-y-2">
                    {loadingClientFiles ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-450" /></div>
                    ) : clientFiles.length === 0 ? (
                      <p className="text-center text-slate-400 py-6 text-[11px]">No explorer files linked to this client</p>
                    ) : (
                      clientFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150/30 dark:border-slate-850 rounded-xl">
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="truncate text-slate-750 dark:text-slate-200 block pr-2" title={file.name}>
                              {file.name}
                            </span>
                          </div>
                          {downloadProgresses[file.name] !== undefined ? (
                            <span className="text-[9px] font-black text-indigo-650 dark:text-indigo-400 animate-pulse px-1">{downloadProgresses[file.name]}%</span>
                          ) : (
                            <button
                              onClick={() => triggerFileDownload(`/api/files?name=${encodeURIComponent(file.name)}&type=${file.category}`, file.name, file.name)}
                              draggable
                              onDragStart={(e) => handleDragStart(e, { url: `/api/files?name=${encodeURIComponent(file.name)}&type=${file.category}`, name: file.name, mimeType: 'application/octet-stream' })}
                              className="p-1 hover:bg-slate-205 dark:hover:bg-slate-800 rounded text-slate-400 transition-all shrink-0"
                              title="Download file"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 5. CALENDAR EVENTS TAB */}
                {sidebarTab === 'events' && (
                  <div className="space-y-3">
                    {linkedEvents.length === 0 ? (
                      <p className="text-center text-slate-400 py-6 text-[11px]">No calendar events scheduled</p>
                    ) : (
                      linkedEvents.map(event => (
                        <div key={event.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-150/45 dark:border-slate-805 rounded-xl space-y-1.5">
                          <p className="font-bold text-slate-800 dark:text-slate-100">{event.title}</p>
                          <div className="flex items-center gap-1 text-[9px] text-slate-400">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span>
                              {new Date(event.startDateTime).toLocaleDateString()} · {new Date(event.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-[10px] text-slate-450 border-t border-slate-150/20 dark:border-slate-800/40 pt-1.5 leading-relaxed">{event.description}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Sticky footer for chat database deletion */}
          <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-955/15 shrink-0 space-y-2">
            <p className="text-[9px] text-red-500 font-black uppercase tracking-wider">Danger Zone</p>
            <button
              onClick={() => {
                const isAdmin = activeConv.type === 'direct' || 
                  (activeConv.creatorId ? activeConv.creatorId === user?.id : activeConv.members[0] === user?.id);
                if (!isAdmin) {
                  alert(`Only the creator/admin of this ${activeConv.type === 'group' ? 'group' : 'channel'} can delete it.`);
                  return;
                }
                setConfirmPhraseInput('');
                setShowDeleteConfirmModal(true);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-955/20 border border-red-200 dark:border-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition-all"
            >
              <Trash2 className="h-4 w-4" /> Delete Entire Chat Data
            </button>
          </div>

        </div>
      )}

      {/* Link Attachment to Project Stage Modal */}
      {linkingAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Link File to Project Stage</h3>
              <button 
                onClick={() => {
                  setLinkingAttachment(null);
                  setSelectedProjectForLink('');
                  setProjectTasksForLink([]);
                }} 
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-805 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">File Selected</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800/40">
                  {linkingAttachment.name}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Select Project *</label>
                <select
                  value={selectedProjectForLink}
                  onChange={e => setSelectedProjectForLink(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                >
                  <option value="">-- Choose a Project --</option>
                  {crmProjects.map(proj => (
                    <option key={proj.id} value={proj.id}>{proj.name} ({proj.businessType || 'B2B'})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Select Project Stage / Task *</p>
                
                {selectedProjectForLink === '' ? (
                  <p className="text-[10px] text-slate-400 italic">Please select a project first.</p>
                ) : loadingTasksForLink ? (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <Loader2 className="h-4.5 w-4.5 animate-spin" /> Loading project stages...
                  </div>
                ) : projectTasksForLink.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">No stages found in this project.</p>
                ) : (
                  <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1">
                    {([
                      { key: 'todo', label: 'Not started', bullet: 'bg-amber-400' },
                      { key: 'in_progress', label: 'In progress', bullet: 'bg-blue-500 animate-pulse' },
                      { key: 'review', label: 'Review', bullet: 'bg-purple-500' },
                      { key: 'done', label: 'Completed', bullet: 'bg-emerald-500' }
                    ] as const).map(group => {
                      const groupTasks = projectTasksForLink.filter(t => t.status === group.key);
                      if (groupTasks.length === 0) return null;
                      
                      return (
                        <div key={group.key} className="space-y-1.5">
                          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 px-1 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${group.bullet}`} />
                            {group.label}
                          </p>
                          <div className="space-y-1 pl-1">
                            {groupTasks.map(task => (
                              <button
                                key={task.id}
                                onClick={() => handleLinkToStage(task)}
                                className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl border border-slate-150/40 dark:border-slate-805/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-xs font-semibold flex items-center justify-between bg-white dark:bg-slate-900 shadow-sm"
                              >
                                <span className="truncate pr-2 text-slate-750 dark:text-slate-200">{task.title}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                  task.status === 'done' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-955/20 dark:text-emerald-450' : 'bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400 border border-slate-100 dark:border-slate-800/40'
                                }`}>
                                  {task.status === 'done' ? 'Done' : 'Pending'}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {linkingSuccessMessage && (
                <div className={`p-2.5 rounded-xl text-center text-xs font-bold ${
                  linkingSuccessMessage.includes('Success') 
                    ? 'bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/35' 
                    : 'bg-amber-50 dark:bg-amber-955/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/35'
                }`}>
                  {linkingSuccessMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">New Conversation</h3>
              <button onClick={() => setShowNewChatModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreateChat} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Type</label>
                <div className="flex gap-2">
                  {(['direct', 'group', 'channel'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setNewChatType(t)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all capitalize ${newChatType === t ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900' : 'border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 hover:border-slate-350'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {newChatType === 'direct' ? (
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Username *</label>
                  <input required type="text" placeholder="e.g. @john_doe" value={newChatUsername} onChange={e => setNewChatUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-205 focus:outline-none transition-all" />
                </div>
              ) : (
                <>
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{newChatType === 'group' ? 'Group Name' : 'Channel Name'} *</label>
                      <input required type="text" placeholder={newChatType === 'group' ? 'e.g. Design Team' : 'e.g. general'} value={newChatName} onChange={e => setNewChatName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-205 focus:outline-none transition-all" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description (Optional)</label>
                      <textarea placeholder={newChatType === 'group' ? 'Describe this group...' : 'Describe this channel...'} value={newChatDescription} onChange={e => setNewChatDescription(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-205 focus:outline-none transition-all resize-none h-14" />
                    </div>
                  </div>
                  {newChatType === 'group' && (
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-450 mb-1">Select Group Members</label>
                      <div className="max-h-[140px] overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 bg-slate-50/50 dark:bg-slate-950/20">
                        {Object.values(usersById)
                          .filter(u => u.id !== user?.id)
                          .map(u => {
                            const isSelected = selectedParticipants.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedParticipants(prev => prev.filter(id => id !== u.id));
                                  } else {
                                    setSelectedParticipants(prev => [...prev, u.id]);
                                  }
                                }}
                                className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left text-xs transition-all hover:bg-slate-100 dark:hover:bg-slate-800/60 ${
                                  isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/20 font-semibold text-indigo-650 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span className="truncate">{u.displayName || u.username}</span>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  readOnly
                                  className="h-3.5 w-3.5 rounded text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
                                />
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowNewChatModal(false)} className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">Cancel</button>
                <button type="submit" disabled={creatingChat} className="px-4 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5">
                  {creatingChat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File viewer modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-sm" onClick={() => setViewingFile(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingFile(null)} className="absolute -top-10 right-0 p-2 text-white hover:bg-white/10 rounded-lg transition-all">
              <X className="h-5 w-5" />
            </button>
            {viewingFile.mimeType?.startsWith('image/') ? (
              <img src={viewingFile.url} alt={viewingFile.name} className="w-full rounded-2xl shadow-2xl" />
            ) : viewingFile.mimeType?.startsWith('audio/') ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">{viewingFile.name}</p>
                <audio controls src={viewingFile.url} className="w-full" />
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-2xl text-center">
                <FileText className="h-12 w-12 text-slate-450 mx-auto mb-4" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">{viewingFile.name}</p>
                {downloadProgresses[viewingFile.id] !== undefined ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 text-indigo-650 dark:text-indigo-400 text-xs font-bold animate-pulse">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Downloading: {downloadProgresses[viewingFile.id]}%
                  </div>
                ) : (
                  <button
                    onClick={() => triggerFileDownload(viewingFile.url, viewingFile.name, viewingFile.id)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:opacity-90 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-semibold transition-all"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Profile / Settings Modal */}
      {showChatProfileModal && activeConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-150/80 dark:border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-950/20">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {activeConv.type === 'direct' ? <User className="h-4 w-4 text-slate-450" /> :
                 activeConv.type === 'group' ? <Users2 className="h-4 w-4 text-indigo-500" /> :
                 <Hash className="h-4 w-4 text-slate-450" />}
                {activeConv.type === 'direct' ? 'User Profile' : 
                 activeConv.type === 'group' ? 'Group Details' : 'Channel Details'}
              </h3>
              <button onClick={() => setShowChatProfileModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              
              {/* Direct Message (DM) User Details */}
              {activeConv.type === 'direct' && (() => {
                const otherId = activeConv.members.find(id => id !== user?.id);
                const otherUser = otherId ? usersById[otherId] : null;
                if (!otherUser) {
                  return <p className="text-xs text-slate-400 text-center">User details not found</p>;
                }
                const isOnline = otherUser.status === 'online';
                return (
                  <div className="text-center space-y-4">
                    <div className="relative h-18 w-18 mx-auto">
                      <div className="h-18 w-18 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center text-2xl font-black overflow-hidden shadow-md">
                        {otherUser.avatar ? (
                          <img src={otherUser.avatar} alt={otherUser.displayName} className="h-full w-full object-cover" />
                        ) : (
                          otherUser.displayName[0]?.toUpperCase()
                        )}
                      </div>
                      <span className={`absolute bottom-0.5 right-0.5 block h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${
                        isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                      }`} />
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-slate-850 dark:text-slate-100">{otherUser.displayName}</h4>
                      <p className="text-xs text-slate-450 dark:text-slate-400">@{otherUser.username}</p>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800/60 pt-4 text-left space-y-3">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                        <span className={`text-xs font-semibold ${isOnline ? 'text-emerald-600 dark:text-emerald-450' : 'text-slate-500'}`}>
                          {isOnline ? 'Active Now' : 'Offline'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Workspace Role</span>
                        <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-350 rounded-full font-semibold capitalize inline-block mt-0.5">
                          {otherUser.role || 'Member'}
                        </span>
                      </div>

                      {/* Danger Zone */}
                      <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-850 pt-3">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danger Zone</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setConfirmPhraseInput('');
                              setShowClearConfirmModal(true);
                            }}
                            className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all"
                          >
                            Clear Messages
                          </button>
                          <button
                            onClick={() => {
                              setConfirmPhraseInput('');
                              setShowDeleteConfirmModal(true);
                            }}
                            className="flex-1 px-3 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete Chat
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Group / Channel Details */}
              {activeConv.type !== 'direct' && (
                <div className="space-y-5">
                  
                  {/* Avatar Upload Section */}
                  <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
                    <div className="relative shrink-0">
                      <div className="h-16 w-16 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-850 dark:text-slate-200 flex items-center justify-center text-lg font-black overflow-hidden shadow-sm">
                        {activeConv.avatar ? (
                          <img src={activeConv.avatar} alt={activeConv.name} className="h-full w-full object-cover" />
                        ) : (
                          activeConv.type === 'channel' ? <Hash className="h-6 w-6 text-slate-450" /> : <Users2 className="h-6 w-6 text-indigo-500" />
                        )}
                      </div>
                      {isUploadingAvatar && (
                        <div className="absolute inset-0 bg-slate-950/40 rounded-full flex items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider">
                        {activeConv.type === 'channel' ? 'Channel Picture' : 'Group Picture'}
                      </span>
                      <label className="inline-block px-3 py-1.5 bg-slate-105 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-all">
                        {activeConv.avatar ? 'Change Picture' : 'Upload Picture'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadAvatar}
                          disabled={isUploadingAvatar}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Name Renaming Section */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-semibold">Name</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingChatName}
                        onChange={e => setEditingChatName(e.target.value)}
                        placeholder="Chat name"
                        className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-200 focus:outline-none transition-all"
                      />
                      <button
                        onClick={handleRenameChat}
                        disabled={isRenamingChat || !editingChatName.trim() || editingChatName.trim() === activeConv.name}
                        className="px-4 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50 animate-fade-in"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {/* Description Editing Section */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-semibold">Description</label>
                    <textarea
                      value={editingChatDescription}
                      onChange={e => setEditingChatDescription(e.target.value)}
                      placeholder="Add a description for this conversation..."
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-200 focus:outline-none transition-all resize-none h-16"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveDescription}
                        disabled={isSavingDescription || editingChatDescription.trim() === (activeConv.description || '')}
                        className="px-3.5 py-1.5 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 animate-fade-in"
                      >
                        {isSavingDescription ? 'Saving...' : 'Save Description'}
                      </button>
                    </div>
                  </div>

                  {/* Associated CRM Client Section */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Associated CRM Client
                    </label>
                    <select
                      value={activeLinkedClient?.id || ''}
                      onChange={e => linkChatToClient(activeConv.id, e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-200 focus:outline-none transition-all"
                    >
                      <option value="">(No Linked Client - Unlinked)</option>
                      {crmClients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.companyName} {c.status === 'inactive' ? '(Inactive)' : ''}
                        </option>
                      ))}
                    </select>
                    {activeLinkedClient && (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 mt-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${activeLinkedClient.status === 'inactive' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            Status: {activeLinkedClient.status === 'inactive' ? 'Inactive' : 'Active'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setClientStatusConfirm({
                            client: activeLinkedClient,
                            targetStatus: activeLinkedClient.status === 'inactive' ? 'active' : 'inactive'
                          })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                            activeLinkedClient.status === 'inactive'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100'
                          }`}
                        >
                          {activeLinkedClient.status === 'inactive' ? 'Reactivate Client' : 'Mark as Inactive'}
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Link this channel to an organization in your CRM, or keep it unlinked.
                    </p>
                  </div>

                  {activeConv.type === 'group' && (
                    <>
                      {/* Members List */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-semibold">
                            Members ({activeConv.members.length})
                          </label>
                        </div>
                        <div className="max-h-[160px] overflow-y-auto space-y-1.5 border border-slate-150 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-955/10">
                          {activeConv.members.map(memberId => {
                            const mUser = usersById[memberId];
                            if (!mUser) return null;
                            const isMe = memberId === user?.id;
                            return (
                              <div key={memberId} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="h-6 w-6 rounded-full bg-slate-205 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-650 dark:text-slate-355 overflow-hidden shrink-0">
                                    {mUser.avatar ? (
                                      <img src={mUser.avatar} alt={mUser.displayName} className="h-full w-full object-cover" />
                                    ) : (
                                      mUser.displayName[0]?.toUpperCase()
                                    )}
                                  </div>
                                  <span className="font-semibold text-slate-750 dark:text-slate-250 truncate">
                                    {mUser.displayName || mUser.username} {isMe && <span className="text-[9px] text-slate-405 font-normal">(you)</span>}
                                  </span>
                                </div>
                                
                                {/* Remove/Leave buttons */}
                                {isMe ? (
                                  <button
                                    onClick={() => handleRemoveParticipant(user.id)}
                                    className="px-2 py-1 rounded-lg text-[10px] bg-red-55/10 text-red-600 dark:bg-red-955/20 dark:text-red-400 hover:bg-red-100/50 transition-all font-bold"
                                  >
                                    Leave
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRemoveParticipant(memberId)}
                                    className="p-1 rounded hover:bg-slate-105 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-all"
                                    title="Remove member"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Add/Invite Member Section */}
                      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-4">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-semibold">Invite Member</label>
                        <input
                          type="text"
                          placeholder="Search workspace members..."
                          value={inviteSearchQuery}
                          onChange={e => setInviteSearchQuery(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-205 focus:outline-none transition-all"
                        />
                        
                        {inviteSearchQuery.trim() !== '' && (
                          <div className="max-h-[120px] overflow-y-auto space-y-1 border border-slate-205 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-950">
                            {Object.values(usersById)
                              .filter(u => 
                                !activeConv.members.includes(u.id) && 
                                (u.displayName.toLowerCase().includes(inviteSearchQuery.toLowerCase()) || 
                                 u.username.toLowerCase().includes(inviteSearchQuery.toLowerCase()))
                              )
                              .map(u => (
                                <button
                                  key={u.id}
                                  onClick={() => handleAddParticipant(u.id)}
                                  className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-xs transition-all text-slate-700 dark:text-slate-350"
                                >
                                  <span>{u.displayName || u.username}</span>
                                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Add</span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Danger Zone */}
                  <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800/80 pt-4">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-semibold">Danger Zone</span>
                    {(activeConv.creatorId ? activeConv.creatorId === user?.id : activeConv.members[0] === user?.id) ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setConfirmPhraseInput('');
                            setShowClearConfirmModal(true);
                          }}
                          className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all"
                        >
                          Clear Messages
                        </button>
                        <button
                          onClick={() => {
                            setConfirmPhraseInput('');
                            setShowDeleteConfirmModal(true);
                          }}
                          className="flex-1 px-3 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete {activeConv.type === 'group' ? 'Group' : 'Channel'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-450 dark:text-slate-500 italic">
                        Only the creator/admin of this {activeConv.type === 'group' ? 'group' : 'channel'} can clear messages or delete it permanently.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-150/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 flex gap-3 shrink-0">
              <button
                onClick={() => setShowChatProfileModal(false)}
                className="flex-1 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showPinnedMessagesModal && activeConv && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scale-in">
            {/* Header */}
            <div className="p-4 border-b border-slate-150/80 dark:border-slate-800/80 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Pin className="h-4 w-4 text-indigo-500 fill-indigo-500/20" /> Pinned Messages
              </h3>
              <button
                onClick={() => setShowPinnedMessagesModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.filter(m => m.pinned).length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Pin className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                  <p className="text-xs font-semibold">No pinned messages yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">Hover over any message and click the pin icon to keep track of important info.</p>
                </div>
              ) : (
                messages.filter(m => m.pinned).map(pinnedMsg => {
                  const pSender = usersById[pinnedMsg.senderId];
                  return (
                    <div
                      key={pinnedMsg.id}
                      onClick={() => {
                        scrollToMessage(pinnedMsg.id);
                        setShowPinnedMessagesModal(false);
                      }}
                      className="p-3 border border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl space-y-1.5 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-800/60 transition-all group relative"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-450 dark:text-slate-400">
                        <span className="font-bold text-slate-600 dark:text-slate-300">
                          {pSender?.displayName || pSender?.username || 'Unknown'}
                        </span>
                        <span>{formatTime(pinnedMsg.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed whitespace-pre-wrap">{renderMessageContent(pinnedMsg.content)}</p>
                      
                      {/* Unpin button directly inside the list */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePinMessage(pinnedMsg.id, true);
                        }}
                        className="absolute right-2 top-2 p-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Unpin message"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-slate-150/85 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 text-center text-[10px] text-slate-450 dark:text-slate-400 shrink-0">
              Click a message to jump directly to it.
            </div>
          </div>
        </div>
      )}

      {pendingUpload && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 rounded-3xl shadow-2xl p-6 flex flex-col gap-4 text-xs animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center text-indigo-650 dark:text-indigo-450 shrink-0">
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
                className="flex-1 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-xl transition-all font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executePendingUpload}
                className="flex-1 py-2.5 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl transition-all font-black"
              >
                Upload & Send
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearConfirmModal && activeConv && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4 animate-scale-in">
            <h4 className="text-sm font-bold text-slate-850 dark:text-slate-100 flex items-center gap-1.5">
              ⚠️ Clear Conversation Messages?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This will permanently delete all messages in <strong>{getConvDisplayName(activeConv)}</strong> from the database. This action is irreversible.
            </p>
            <div className="space-y-1">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Type <span className="text-red-500 font-bold">CLEAR</span> to confirm
              </label>
              <input
                type="text"
                value={confirmPhraseInput}
                onChange={e => setConfirmPhraseInput(e.target.value)}
                placeholder="CLEAR"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-855 dark:text-slate-200 focus:outline-none transition-all uppercase"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="flex-1 py-2 text-center text-xs font-semibold text-slate-650 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleClearChat}
                disabled={confirmPhraseInput !== 'CLEAR' || isExecutingAction}
                className="flex-1 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                {isExecutingAction ? 'Clearing...' : 'Clear permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirmModal && (convToDelete || activeConv) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4 animate-scale-in">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Trash2 className="h-4 w-4 text-rose-500 shrink-0" />
              Permanently Delete Chat?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This will permanently delete <strong>{getConvDisplayName(convToDelete || activeConv)}</strong> and all of its messages from the database. It cannot be retrieved anymore.
            </p>
            <div className="space-y-1">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Type the name of this chat <strong className="text-slate-900 dark:text-slate-100">{getConvDisplayName(convToDelete || activeConv)}</strong> to confirm
              </label>
              <input
                type="text"
                value={confirmPhraseInput}
                onChange={e => setConfirmPhraseInput(e.target.value)}
                placeholder={getConvDisplayName(convToDelete || activeConv)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-850 dark:text-slate-200 focus:outline-none transition-all"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setConvToDelete(null);
                  setConfirmPhraseInput('');
                }}
                className="flex-1 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteChat}
                disabled={confirmPhraseInput !== getConvDisplayName(convToDelete || activeConv) || isExecutingAction}
                className="flex-1 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isExecutingAction ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW CHAT FOR CLIENT MODAL */}
      {newChatClient && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setNewChatClient(null); }}
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> New Chat for {newChatClient.companyName}
                </h3>
                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                  Created on top of previous conversations for this client
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewChatClient(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClientChat} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                  Chat / Channel Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={`e.g. ${newChatClient.companyName} - Project Alpha`}
                  value={newClientChatName}
                  onChange={e => setNewClientChatName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                  Conversation Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewClientChatType('channel')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      newClientChatType === 'channel'
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-slate-100 dark:text-slate-950'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Hash className="h-3.5 w-3.5" /> Channel
                    </div>
                    <p className={`text-[10px] mt-1 ${newClientChatType === 'channel' ? 'text-white/70 dark:text-slate-700' : 'text-slate-400'}`}>
                      Shared workspace channel linked to client
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewClientChatType('group')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      newClientChatType === 'group'
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-slate-100 dark:text-slate-950'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Users2 className="h-3.5 w-3.5" /> Private Group
                    </div>
                    <p className={`text-[10px] mt-1 ${newClientChatType === 'group' ? 'text-white/70 dark:text-slate-700' : 'text-slate-400'}`}>
                      Specific members linked to client
                    </p>
                  </button>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setNewChatClient(null)}
                  className="flex-1 py-2.5 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingClientChat || !newClientChatName.trim()}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {creatingClientChat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create on Top
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLIENT STATUS CONFIRMATION MODAL */}
      {clientStatusConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget && !isUpdatingClientStatus) setClientStatusConfirm(null); }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${
                clientStatusConfirm.targetStatus === 'inactive'
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                  : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
              }`}>
                {clientStatusConfirm.targetStatus === 'inactive' ? (
                  <UserX className="h-6 w-6" />
                ) : (
                  <CheckCircle2 className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {clientStatusConfirm.targetStatus === 'inactive'
                    ? 'Mark Client as Inactive?'
                    : 'Reactivate Client?'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {clientStatusConfirm.client.companyName}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-600 dark:text-slate-300 space-y-2">
              {clientStatusConfirm.targetStatus === 'inactive' ? (
                <>
                  <p>
                    Are you sure you want to mark <strong>{clientStatusConfirm.client.companyName}</strong> as inactive?
                  </p>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                    <p>• Its chats will be removed from the active <strong>Clients</strong> tab and moved to <strong>Inactive</strong>.</p>
                    <p>• You can still view, reactivate, or delete these chats anytime.</p>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Are you sure you want to reactivate <strong>{clientStatusConfirm.client.companyName}</strong>?
                  </p>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                    <p>• Its chats and workspace will be restored to the active <strong>Clients</strong> tab.</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={isUpdatingClientStatus}
                onClick={() => setClientStatusConfirm(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingClientStatus}
                onClick={handleConfirmClientStatusChange}
                className={`px-4 py-2 text-xs font-semibold rounded-xl text-white transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                  clientStatusConfirm.targetStatus === 'inactive'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-xs'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-xs'
                }`}
              >
                {isUpdatingClientStatus && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {clientStatusConfirm.targetStatus === 'inactive' ? 'Confirm Inactive' : 'Confirm Reactivate'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
