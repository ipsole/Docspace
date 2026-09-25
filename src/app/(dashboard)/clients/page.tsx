'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import {
  Users2, Plus, DollarSign, AlertCircle, Loader2, X,
  Building2, Briefcase, Search, Trash2, Calendar, FileText, CheckCircle2,
  AlertTriangle, ExternalLink, Mail, Phone, MapPin, Globe, Check, Eye, Edit2, Info, ChevronRight, FolderCheck, Download, Settings,
  ReceiptText, FileSpreadsheet, Clock, ArrowUpDown, Camera, Upload, Smile, Sparkles, Archive, UserX, ArrowRight,
  Tag, Tags, MoreVertical, Bell, ArrowLeft
} from 'lucide-react';
import { SheetConfig, FieldDiff } from '@/lib/services/sheetSyncTemplate';
import { determineGSTTreatment, classifyClientCategory, INDIAN_STATES } from '@/lib/services/gstEngine';
import InvoicePreviewModal from '@/components/InvoicePreviewModal';
import { DEFAULT_BUSINESS_PROFILE, BusinessProfile } from '@/lib/invoice-renderer';

// Color definitions for client collection tags
const TAG_COLORS: Record<string, string> = {
  'Important Client': 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60',
  'High Ticket': 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60',
  'Low Ticket': 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60',
};

const DYNAMIC_TAG_PALETTES = [
  'bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 border-violet-200/80 dark:border-violet-800/60',
  'bg-rose-50 dark:bg-rose-955/40 text-rose-800 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60',
  'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 border-cyan-200/80 dark:border-cyan-800/60',
  'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/60',
  'bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-200/80 dark:border-fuchsia-800/60',
  'bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border-teal-200/80 dark:border-teal-800/60',
];

function getTagBadgeClass(tagName: string): string {
  if (TAG_COLORS[tagName]) return TAG_COLORS[tagName];
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) hash = (hash + tagName.charCodeAt(i)) % DYNAMIC_TAG_PALETTES.length;
  return DYNAMIC_TAG_PALETTES[hash];
}

interface Client {
  id: string;
  workspaceId: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  industry: string;
  status: 'active' | 'inactive';
  notes: string;
  createdAt: string;
  avatarUrl?: string | null;
  clientLocation?: 'domestic' | 'international';
  clientType?: 'business' | 'individual';
  paymentSource?: 'foreign_remittance' | 'indian_bank';
  invoiceCurrency?: string;
  gstTreatmentOverride?: 'gst_applicable' | 'lut_export' | null;
  gstNumber?: string;
  placeOfSupply?: string;
  convertedFromLead?: boolean;
  profileCompleted?: boolean;
  tags?: string[];
}

interface Project {
  id: string;
  workspaceId: string;
  clientId: string | null;
  businessType?: string | null;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';
  budget: number;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  members: string[];
  createdAt: string;
}

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
  subtasks: { id: string; title: string; completed: boolean }[];
  money?: number | null;
  clientId?: string | null;
  attachments?: { id: string; name: string; url: string; size: number; mimeType: string }[];
}

interface Invoice {
  id: string;
  workspaceId: string;
  clientId: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  issueDate: string;
  dueDate: string;
  items: { description: string; quantity: number; unitPrice: number; taxRate: number }[];
  discount: number;
  taxTotal: number;
  subtotal: number;
  total: number;
  currency: string;
  notes: string;
  createdAt: string;
}

interface CalendarEvent {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  type: string;
  location: string;
  clientId?: string;
}

export type TimeFilter = 'all' | 'this_month' | 'last_month' | '3_months' | '6_months' | '1_year' | 'older';
export type SortBasis = 'recent' | 'alphabet' | 'custom';

const TIME_FILTER_OPTIONS: { id: TimeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: '3_months', label: '3 Months' },
  { id: '6_months', label: '6 Months' },
  { id: '1_year', label: '1 Year' },
  { id: 'older', label: '1 Year+' },
];

function isWithinTimeFilter(dateStr?: string | null, filter: TimeFilter = 'all'): boolean {
  if (filter === 'all' || !dateStr) return true;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return true;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (filter === 'this_month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (filter === 'last_month') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return date.getFullYear() === lastMonthDate.getFullYear() && date.getMonth() === lastMonthDate.getMonth();
  }
  if (filter === '3_months') {
    return diffDays <= 92;
  }
  if (filter === '6_months') {
    return diffDays <= 184;
  }
  if (filter === '1_year') {
    return diffDays <= 366;
  }
  if (filter === 'older') {
    return diffDays > 366;
  }
  return true;
}

function formatAddedDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PROFILE_TAG_ICONS = [
  { id: '🏢', label: 'Office' },
  { id: '💼', label: 'Business' },
  { id: '🌐', label: 'Global' },
  { id: '🚀', label: 'Startup' },
  { id: '💻', label: 'Tech' },
  { id: '🛍️', label: 'Retail' },
  { id: '🎨', label: 'Creative' },
  { id: '📈', label: 'Finance' },
  { id: '⚖️', label: 'Legal' },
  { id: '⚡', label: 'Agency' },
  { id: '🏥', label: 'Health' },
  { id: '🎓', label: 'Edu' },
  { id: '🤖', label: 'AI' },
  { id: '⭐', label: 'VIP' },
];

const compressImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 160;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

function renderClientAvatar(avatarUrl?: string | null, companyName: string = '', sizeClass: string = 'h-10 w-10 text-sm') {
  if (avatarUrl) {
    if (avatarUrl.startsWith('data:image/') || avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      return (
        <img
          src={avatarUrl}
          alt={companyName}
          className={`${sizeClass} rounded-2xl object-cover shadow-inner shrink-0 border border-slate-200/60 dark:border-slate-800`}
        />
      );
    }
    // Icon tag / emoji
    return (
      <div className={`${sizeClass} rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 shadow-inner border border-slate-200/60 dark:border-slate-800 select-none`}>
        {avatarUrl}
      </div>
    );
  }

  // Fallback initial
  return (
    <div className={`${sizeClass} rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 flex items-center justify-center font-black shrink-0 shadow-inner border border-slate-200/60 dark:border-slate-800`}>
      {companyName ? companyName[0].toUpperCase() : 'C'}
    </div>
  );
}

export default function ClientsPage() {
  const { activeWorkspace, getTabAccess } = useWorkspace();
  const isReadOnly = getTabAccess('clients') === 'view';
  const { user } = useAuth();
  const confirm = useConfirm();
  const [mounted, setMounted] = useState(false);

  // Tab state
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'info' | 'projects' | 'billing' | 'invoices' | 'proforma' | 'files' | 'events'>('info');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Data states
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [previewingInvoice, setPreviewingInvoice] = useState<Invoice | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(DEFAULT_BUSINESS_PROFILE);
  
  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  // Google Sheets Sync & Changes Tracking
  const [isSyncingClientsToSheet, setIsSyncingClientsToSheet] = useState(false);
  const [syncingSingleClientId, setSyncingSingleClientId] = useState<string | null>(null);
  const [clientSheetFeedback, setClientSheetFeedback] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string>('https://docs.google.com/spreadsheets/d/1a0Xaf42WlDlA4tt4emgEp7ECpknC4a7pBfmtgJjwMe0/edit');
  const [sheetConfig, setSheetConfig] = useState<SheetConfig | null>(null);
  const [showChangesDropdown, setShowChangesDropdown] = useState(false);
  const [selectedChangesSyncIds, setSelectedChangesSyncIds] = useState<string[]>([]);
  const changesDropdownRef = React.useRef<HTMLDivElement>(null);

  const fetchSheetConfig = React.useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/crm/sheet-sync?workspaceId=${activeWorkspace.id}`);
      const data = await res.json();
      if (data.config) {
        setSheetConfig(data.config);
        if (data.config.sheetUrl) {
          setSheetUrl(data.config.sheetUrl);
        }
      }
    } catch (e) {
      console.error('Error fetching sheet config:', e);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    fetchSheetConfig();
  }, [fetchSheetConfig]);

  // Click outside listener for changes dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (changesDropdownRef.current && !changesDropdownRef.current.contains(e.target as Node)) {
        setShowChangesDropdown(false);
      }
    };
    if (showChangesDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChangesDropdown]);

  // Computed list of clients with pending unsynced changes
  const pendingChangesList = useMemo(() => {
    if (!sheetConfig) return [];
    const list: Array<{
      clientId: string;
      client: Client;
      companyName: string;
      changeType: 'created' | 'updated';
      details: string;
      changedAt: string;
      fieldDiffs?: FieldDiff[];
    }> = [];

    const recorded = sheetConfig.pendingClientChanges || {};
    const seenIds = new Set<string>();

    // 1. Explicitly recorded changes
    Object.values(recorded).forEach(item => {
      const cli = clients.find(c => c.id === item.clientId);
      if (cli) {
        list.push({
          clientId: item.clientId,
          client: cli,
          companyName: cli.companyName || item.companyName,
          changeType: item.changeType,
          details: item.details || (item.changeType === 'created' ? 'New client registered' : 'Client details updated'),
          changedAt: item.changedAt || cli.createdAt || new Date().toISOString(),
          fieldDiffs: item.fieldDiffs || []
        });
        seenIds.add(item.clientId);
      }
    });

    // 2. Unsynced clients from syncedClientIds array if present
    if (Array.isArray(sheetConfig.syncedClientIds)) {
      clients.forEach(cli => {
        if (!sheetConfig.syncedClientIds?.includes(cli.id) && !seenIds.has(cli.id)) {
          const diffs: FieldDiff[] = [];
          if (cli.phone) diffs.push({ field: 'phone', label: 'Phone', oldValue: '', newValue: cli.phone });
          if (cli.email) diffs.push({ field: 'email', label: 'Email', oldValue: '', newValue: cli.email });
          if (cli.status) diffs.push({ field: 'status', label: 'Status', oldValue: '', newValue: (cli.status || 'active').toUpperCase() });
          if (cli.gstNumber) diffs.push({ field: 'gstNumber', label: 'GSTIN', oldValue: '', newValue: cli.gstNumber });

          list.push({
            clientId: cli.id,
            client: cli,
            companyName: cli.companyName,
            changeType: 'created',
            details: 'Not yet synced to spreadsheet',
            changedAt: cli.createdAt || new Date().toISOString(),
            fieldDiffs: diffs
          });
          seenIds.add(cli.id);
        }
      });
    } else if (sheetConfig.lastClientSync) {
      const lastSyncTime = new Date(sheetConfig.lastClientSync).getTime();
      clients.forEach(cli => {
        const createdTime = cli.createdAt ? new Date(cli.createdAt).getTime() : 0;
        if (createdTime > lastSyncTime && !seenIds.has(cli.id)) {
          const diffs: FieldDiff[] = [];
          if (cli.phone) diffs.push({ field: 'phone', label: 'Phone', oldValue: '', newValue: cli.phone });
          if (cli.email) diffs.push({ field: 'email', label: 'Email', oldValue: '', newValue: cli.email });
          if (cli.status) diffs.push({ field: 'status', label: 'Status', oldValue: '', newValue: (cli.status || 'active').toUpperCase() });
          if (cli.gstNumber) diffs.push({ field: 'gstNumber', label: 'GSTIN', oldValue: '', newValue: cli.gstNumber });

          list.push({
            clientId: cli.id,
            client: cli,
            companyName: cli.companyName,
            changeType: 'created',
            details: 'Added after last sync',
            changedAt: cli.createdAt || new Date().toISOString(),
            fieldDiffs: diffs
          });
          seenIds.add(cli.id);
        }
      });
    }

    return list.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }, [sheetConfig, clients]);

  // Client Google Sheet Sync Selection State
  const [showSyncSelectionModal, setShowSyncSelectionModal] = useState(false);
  const [selectedClientSyncIds, setSelectedClientSyncIds] = useState<string[]>([]);
  const [syncSearchTerm, setSyncSearchTerm] = useState('');

  const openSyncSelectionModal = () => {
    setSelectedClientSyncIds(clients.map(c => c.id));
    setSyncSearchTerm('');
    setShowSyncSelectionModal(true);
  };

  const toggleSelectAllSyncClients = () => {
    if (selectedClientSyncIds.length === clients.length) {
      setSelectedClientSyncIds([]);
    } else {
      setSelectedClientSyncIds(clients.map(c => c.id));
    }
  };

  const toggleClientSyncSelection = (id: string) => {
    setSelectedClientSyncIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const formatClientForSheet = (cli: Client) => {
    const paymentSourceLabel = cli.paymentSource === 'indian_bank'
      ? 'Indian Bank'
      : cli.paymentSource === 'foreign_remittance'
      ? 'Foreign Remittance'
      : (cli.paymentSource || '');

    const clientLocationLabel = cli.clientLocation === 'international' ? 'International' : 'Domestic';
    const clientTypeLabel = cli.clientType === 'individual' ? 'Individual' : 'Business';
    const gstTreatmentLabel = cli.gstTreatmentOverride === 'lut_export'
      ? 'LUT Export (Zero-Rated)'
      : cli.gstTreatmentOverride === 'gst_applicable'
      ? 'GST Applicable'
      : 'Regular';

    return {
      id: cli.id,
      companyName: cli.companyName,
      contactPerson: cli.contactPerson,
      email: cli.email,
      phone: cli.phone,
      website: cli.website || '',
      address: cli.address || '',
      placeOfSupply: cli.placeOfSupply || '',
      clientLocation: clientLocationLabel,
      clientType: clientTypeLabel,
      gstNumber: cli.gstNumber || '',
      gstTreatment: gstTreatmentLabel,
      paymentSource: paymentSourceLabel,
      status: (cli.status || 'active').toUpperCase(),
      invoiceCurrency: cli.invoiceCurrency || 'INR',
      industry: cli.industry || '',
      tags: cli.tags || [],
      notes: cli.notes || '',
      createdAt: cli.createdAt ? cli.createdAt.split('T')[0] : '',
    };
  };

  // Reusable sync function for specific clients (one, multiple, or all)
  const syncSpecificClients = async (targetClientIds: string[]) => {
    if (!activeWorkspace || targetClientIds.length === 0) return;

    const clientsToSync = clients
      .filter(c => targetClientIds.includes(c.id))
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return String(a.companyName || '').localeCompare(String(b.companyName || ''));
      });

    if (clientsToSync.length === 0) return;

    setIsSyncingClientsToSheet(true);
    if (targetClientIds.length === 1) {
      setSyncingSingleClientId(targetClientIds[0]);
    }
    setClientSheetFeedback(null);

    try {
      const formatted = clientsToSync.map(formatClientForSheet);
      const isFullSync = clientsToSync.length === clients.length;

      const res = await fetch('/api/crm/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          action: 'sync_clients',
          data: formatted,
          isFullSync,
          allActiveIds: clients.map(c => c.id),
          allActiveNames: clients.map(c => c.companyName),
        })
      });

      const data = await res.json();
      if (data.success) {
        if (showSyncSelectionModal) {
          setShowSyncSelectionModal(false);
        }

        // Optimistically update sheetConfig state
        setSheetConfig(prev => {
          if (!prev) return prev;
          const nextSynced = Array.from(new Set([...(prev.syncedClientIds || []), ...targetClientIds]));
          const nextChanges = { ...(prev.pendingClientChanges || {}) };
          targetClientIds.forEach(id => delete nextChanges[id]);
          return {
            ...prev,
            syncedClientIds: nextSynced,
            pendingClientChanges: nextChanges,
            lastClientSync: new Date().toISOString()
          };
        });

        setSelectedChangesSyncIds(prev => prev.filter(id => !targetClientIds.includes(id)));

        const deletedMsg = data.result?.deleted ? ` (reconciled & removed ${data.result.deleted} extra/deleted row${data.result.deleted > 1 ? 's' : ''})` : '';
        const namesMsg = clientsToSync.length === 1
          ? `"${clientsToSync[0].companyName}"`
          : `${clientsToSync.length} client${clientsToSync.length > 1 ? 's' : ''}`;
        setClientSheetFeedback(`Successfully synced ${namesMsg} to Google Sheet${deletedMsg}!`);
        setTimeout(() => setClientSheetFeedback(null), 5000);
      } else {
        alert(data.error || 'Failed to sync clients with Google Sheet. Please check Invoices > Sync to Sheet > Settings.');
      }
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setIsSyncingClientsToSheet(false);
      setSyncingSingleClientId(null);
    }
  };

  const handleConfirmSyncClients = async () => {
    if (selectedClientSyncIds.length === 0) {
      alert('Please select at least one client to sync.');
      return;
    }
    await syncSpecificClients(selectedClientSyncIds);
  };

  // Filtering & Sorting
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sortBasis, setSortBasis] = useState<SortBasis>('recent');
  const [clientSection, setClientSection] = useState<'active' | 'inactive'>('active');

  // Add/Edit Modals, Delete Confirmation & Avatar
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMarkSafeModal, setShowMarkSafeModal] = useState(false);
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteConsentChecked, setDeleteConsentChecked] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [markingSafe, setMarkingSafe] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  
  // Form fields
  const [formAvatarUrl, setFormAvatarUrl] = useState('');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formWebsite, setFormWebsite] = useState('');
  const [formIndustry, setFormIndustry] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formClientLocation, setFormClientLocation] = useState<'domestic' | 'international'>('domestic');
  const [formClientType, setFormClientType] = useState<'business' | 'individual'>('business');
  const [formPaymentSource, setFormPaymentSource] = useState<'foreign_remittance' | 'indian_bank'>('indian_bank');
  const [formInvoiceCurrency, setFormInvoiceCurrency] = useState<string>('INR');
  const [formGstTreatmentOverride, setFormGstTreatmentOverride] = useState<'gst_applicable' | 'lut_export' | 'none'>('none');
  const [formGstNumber, setFormGstNumber] = useState('');
  const [formPlaceOfSupply, setFormPlaceOfSupply] = useState('');

  // Custom Tags & Collections states
  const DEFAULT_CUSTOM_TAGS = ['Important Client', 'High Ticket', 'Low Ticket'];
  const [customTags, setCustomTags] = useState<string[]>(DEFAULT_CUSTOM_TAGS);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [showManageTagsModal, setShowManageTagsModal] = useState(false);
  const [tagMenuClientId, setTagMenuClientId] = useState<string | null>(null);
  const [newTagNameInput, setNewTagNameInput] = useState('');
  const [editingTagName, setEditingTagName] = useState<{ oldName: string; newName: string } | null>(null);
  const [formTags, setFormTags] = useState<string[]>([]);

  // Add Meeting states
  const [showAddMeetingModal, setShowAddMeetingModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingStartTime, setMeetingStartTime] = useState('09:00');
  const [meetingEndTime, setMeetingEndTime] = useState('10:00');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  // Restore session cache once mounted in browser to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const savedTab = sessionStorage.getItem('last_active_client_tab');
        if (savedTab) setActiveTab(savedTab as any);

        const savedSection = sessionStorage.getItem('last_active_client_section');
        if (savedSection) setClientSection(savedSection as any);

        const savedTimeFilter = sessionStorage.getItem('last_active_client_time_filter');
        if (savedTimeFilter) setTimeFilter(savedTimeFilter as any);

        const savedSortBasis = sessionStorage.getItem('last_active_client_sort_basis');
        if (savedSortBasis) setSortBasis(savedSortBasis as any);

        const cachedClients = sessionStorage.getItem('cached_crm_clients');
        if (cachedClients) {
          const parsed = JSON.parse(cachedClients);
          setClients(parsed);
          const savedId = sessionStorage.getItem('last_active_client_id');
          if (savedId && parsed.some((c: any) => c.id === savedId)) {
            setSelectedClientId(savedId);
          } else if (parsed.length > 0) {
            const firstActive = parsed.find((c: any) => c.status !== 'inactive');
            setSelectedClientId(firstActive ? firstActive.id : parsed[0].id);
          }
          setLoading(false);
        }

        const cachedProjects = sessionStorage.getItem('cached_crm_projects');
        if (cachedProjects) setProjects(JSON.parse(cachedProjects));

        const cachedTasks = sessionStorage.getItem('cached_crm_tasks');
        if (cachedTasks) setTasks(JSON.parse(cachedTasks));

        const cachedInvoices = sessionStorage.getItem('cached_crm_invoices');
        if (cachedInvoices) setInvoices(JSON.parse(cachedInvoices));

        const cachedEvents = sessionStorage.getItem('cached_crm_events');
        if (cachedEvents) setEvents(JSON.parse(cachedEvents));
      } catch {}
    }

    // Listen for task status changes from other pages (e.g. projects page)
    let bc: BroadcastChannel | null = null;
    let bcInvoice: BroadcastChannel | null = null;
    let bcClient: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('docspace_task_status');
      bc.onmessage = (event) => {
        const { taskId, status } = event.data || {};
        if (!taskId || !status) return;
        setTasks(prev => {
          const updated = prev.map(t => t.id === taskId ? { ...t, status: status as Task['status'] } : t);
          try { sessionStorage.setItem('cached_crm_tasks', JSON.stringify(updated)); } catch {}
          return updated;
        });
      };
    } catch {}

    try {
      bcInvoice = new BroadcastChannel('docspace_invoice_status');
      bcInvoice.onmessage = (event) => {
        const { invoiceId, status } = event.data || {};
        if (!invoiceId || !status) return;
        setInvoices(prev => {
          const updated = prev.map(inv => inv.id === invoiceId ? { ...inv, status } : inv);
          try { sessionStorage.setItem('cached_crm_invoices', JSON.stringify(updated)); } catch {}
          return updated;
        });
      };
    } catch {}

    try {
      bcClient = new BroadcastChannel('docspace_client_status');
      bcClient.onmessage = (event) => {
        const { clientId, status } = event.data || {};
        if (!clientId || !status) return;
        setClients(prev => {
          const updated = prev.map(c => c.id === clientId ? { ...c, status } : c);
          try { sessionStorage.setItem('cached_crm_clients', JSON.stringify(updated)); } catch {}
          return updated;
        });
      };
    } catch {}

    return () => {
      try { bc?.close(); } catch {}
      try { bcInvoice?.close(); } catch {}
      try { bcClient?.close(); } catch {}
    };
  }, []);

  // Persistence effects (only write after mounted)
  useEffect(() => {
    if (mounted && selectedClientId && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_active_client_id', selectedClientId);
      } catch {}
    }
  }, [selectedClientId, mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_active_client_tab', activeTab);
      } catch {}
    }
  }, [activeTab, mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_active_client_section', clientSection);
      } catch {}
    }
  }, [clientSection, mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_active_client_time_filter', timeFilter);
      } catch {}
    }
  }, [timeFilter, mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_active_client_sort_basis', sortBasis);
      } catch {}
    }
  }, [sortBasis, mounted]);

  // Load and sync workspace custom tags from API, localStorage and existing clients
  useEffect(() => {
    if (!activeWorkspace || typeof window === 'undefined') return;
    let isCancelled = false;

    const loadTags = async () => {
      let baseTags: string[] = DEFAULT_CUSTOM_TAGS;
      try {
        const saved = localStorage.getItem(`client_custom_tags_${activeWorkspace.id}`) || localStorage.getItem(`crm_custom_tags_${activeWorkspace.id}`);
        if (saved) baseTags = JSON.parse(saved);
      } catch {}

      const clientTags = clients.flatMap(c => c.tags || []);
      const localMerged = Array.from(new Set([...DEFAULT_CUSTOM_TAGS, ...baseTags, ...clientTags])).filter(Boolean);
      if (!isCancelled) {
        setCustomTags(localMerged.length > 0 ? localMerged : DEFAULT_CUSTOM_TAGS);
      }

      try {
        const res = await fetch(`/api/crm/tags?workspaceId=${activeWorkspace.id}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tags) && !isCancelled) {
            const serverMerged = Array.from(new Set([...data.tags, ...localMerged])).filter(Boolean);
            setCustomTags(serverMerged);
            try {
              localStorage.setItem(`client_custom_tags_${activeWorkspace.id}`, JSON.stringify(serverMerged));
              localStorage.setItem(`crm_custom_tags_${activeWorkspace.id}`, JSON.stringify(serverMerged));
            } catch {}
          }
        }
      } catch {}
    };

    loadTags();
    return () => { isCancelled = true; };
  }, [activeWorkspace?.id, clients]);

  const saveCustomTags = async (newTags: string[], actionMeta?: { action?: 'rename' | 'delete'; oldTag?: string; newTag?: string }) => {
    setCustomTags(newTags);
    if (activeWorkspace && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`client_custom_tags_${activeWorkspace.id}`, JSON.stringify(newTags));
        localStorage.setItem(`crm_custom_tags_${activeWorkspace.id}`, JSON.stringify(newTags));
        window.dispatchEvent(new CustomEvent('crm_tags_updated', { detail: { tags: newTags, workspaceId: activeWorkspace.id } }));
        window.dispatchEvent(new Event('storage'));
      } catch {}

      try {
        await fetch('/api/crm/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: activeWorkspace.id,
            tags: newTags,
            ...(actionMeta || {})
          })
        });
      } catch (err) {
        console.error('Failed to sync tags to server:', err);
      }
    }
  };

  // Close tag popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagMenuClientId && !(e.target as HTMLElement)?.closest('.tag-popover-container')) {
        setTagMenuClientId(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [tagMenuClientId]);

  // Handle Escape key to exit modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewingInvoice) {
          setPreviewingInvoice(null);
        } else if (showManageTagsModal) {
          setShowManageTagsModal(false);
        } else if (tagMenuClientId) {
          setTagMenuClientId(null);
        } else if (showAvatarPickerModal) {
          setShowAvatarPickerModal(false);
        } else if (showDeleteModal) {
          setShowDeleteModal(false);
        } else if (showMarkSafeModal) {
          setShowMarkSafeModal(false);
        } else {
          setShowAddModal(false);
          setShowEditModal(false);
          setShowAddMeetingModal(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteModal, showMarkSafeModal, showAvatarPickerModal, previewingInvoice, showManageTagsModal, tagMenuClientId]);

  // Tag & Collection operations
  const handleToggleClientTag = async (client: Client, tag: string) => {
    if (!activeWorkspace) return;
    const currentTags = client.tags || [];
    const nextTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];

    const updatedClient = { ...client, tags: nextTags };
    setClients(prev => prev.map(c => c.id === client.id ? updatedClient : c));

    if (!customTags.includes(tag)) {
      saveCustomTags([...customTags, tag]);
    }

    try {
      await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          workspaceId: activeWorkspace.id,
          tags: nextTags
        })
      });
      fetchSheetConfig();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('crm_clients_updated', { detail: { clientId: client.id, tags: nextTags, workspaceId: activeWorkspace.id } }));
      }
    } catch (err) {
      console.error('Failed to update client tag:', err);
    }
  };

  const handleMoveClientToTag = async (client: Client, targetTag: string) => {
    if (!activeWorkspace) return;
    const currentTags = client.tags || [];
    const isTicketCategory = (t: string) => t.toLowerCase().includes('ticket');
    let nextTags: string[];

    if (isTicketCategory(targetTag)) {
      nextTags = [...currentTags.filter(t => !isTicketCategory(t)), targetTag];
    } else {
      nextTags = currentTags.includes(targetTag) ? currentTags : [...currentTags, targetTag];
    }

    const updatedClient = { ...client, tags: nextTags };
    setClients(prev => prev.map(c => c.id === client.id ? updatedClient : c));

    if (!customTags.includes(targetTag)) {
      saveCustomTags([...customTags, targetTag]);
    }

    try {
      await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          workspaceId: activeWorkspace.id,
          tags: nextTags
        })
      });
      fetchSheetConfig();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('crm_clients_updated', { detail: { clientId: client.id, tags: nextTags, workspaceId: activeWorkspace.id } }));
      }
    } catch (err) {
      console.error('Failed to move client to tag:', err);
    }
  };

  const handleCreateNewTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (customTags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      alert('This tag already exists');
      return;
    }
    const next = [...customTags, trimmed];
    saveCustomTags(next);
    setNewTagNameInput('');
  };

  const handleRenameTag = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingTagName(null);
      return;
    }
    const next = customTags.map(t => t === oldName ? trimmed : t);
    saveCustomTags(next, { action: 'rename', oldTag: oldName, newTag: trimmed });

    if (selectedTagFilter === oldName) {
      setSelectedTagFilter(trimmed);
    }

    const affected = clients.filter(c => c.tags?.includes(oldName));
    const updatedClients = clients.map(c => {
      if (c.tags?.includes(oldName)) {
        return { ...c, tags: (c.tags || []).map(t => t === oldName ? trimmed : t) };
      }
      return c;
    });
    setClients(updatedClients);

    setEditingTagName(null);

    if (activeWorkspace && affected.length > 0) {
      await Promise.all(affected.map(c => {
        const newTags = (c.tags || []).map(t => t === oldName ? trimmed : t);
        return fetch('/api/crm/clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: c.id,
            workspaceId: activeWorkspace.id,
            tags: newTags
          })
        });
      }));
      fetchSheetConfig();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('crm_clients_updated', { detail: { workspaceId: activeWorkspace.id } }));
      }
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    const ok = await confirm({
      title: 'Delete Collection Tag',
      message: `Are you sure you want to delete the tag "${tagName}"? Clients with this tag will be untagged from it.`,
      confirmText: 'Delete Tag',
      variant: 'danger',
    });
    if (!ok) return;

    const next = customTags.filter(t => t !== tagName);
    saveCustomTags(next, { action: 'delete', oldTag: tagName });

    if (selectedTagFilter === tagName) {
      setSelectedTagFilter('all');
    }

    const affected = clients.filter(c => c.tags?.includes(tagName));
    const updatedClients = clients.map(c => {
      if (c.tags?.includes(tagName)) {
        return { ...c, tags: (c.tags || []).filter(t => t !== tagName) };
      }
      return c;
    });
    setClients(updatedClients);

    if (activeWorkspace && affected.length > 0) {
      await Promise.all(affected.map(c => {
        const newTags = (c.tags || []).filter(t => t !== tagName);
        return fetch('/api/crm/clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: c.id,
            workspaceId: activeWorkspace.id,
            tags: newTags
          })
        });
      }));
      fetchSheetConfig();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('crm_clients_updated', { detail: { workspaceId: activeWorkspace.id } }));
      }
    }
  };

  const fetchAllData = async () => {
    if (!activeWorkspace) return;
    const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem('cached_crm_clients');
    if (!hasCache) setLoading(true);
    try {
      const wsId = activeWorkspace.id;
      const [clientsRes, projectsRes, tasksRes, invoicesRes, eventsRes] = await Promise.all([
        fetch(`/api/crm/clients?workspaceId=${wsId}`),
        fetch(`/api/projects?workspaceId=${wsId}`),
        fetch(`/api/projects/tasks?workspaceId=${wsId}`),
        fetch(`/api/crm/invoices?workspaceId=${wsId}`),
        fetch(`/api/calendar?workspaceId=${wsId}`),
      ]);

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData);
        try {
          sessionStorage.setItem('cached_crm_clients', JSON.stringify(clientsData));
        } catch {}

        // Restore or maintain selected client
        const savedClientId = typeof window !== 'undefined' ? sessionStorage.getItem('last_active_client_id') : null;
        setSelectedClientId(prev => {
          if (prev && clientsData.some((c: any) => c.id === prev)) return prev;
          if (savedClientId && clientsData.some((c: any) => c.id === savedClientId)) return savedClientId;
          if (clientsData.length > 0) {
            const firstActive = clientsData.find((c: any) => c.status !== 'inactive');
            return firstActive ? firstActive.id : clientsData[0].id;
          }
          return '';
        });
      }
      if (projectsRes.ok) {
        const d = await projectsRes.json();
        setProjects(d);
        try { sessionStorage.setItem('cached_crm_projects', JSON.stringify(d)); } catch {}
      }
      if (tasksRes.ok) {
        const d = await tasksRes.json();
        setTasks(d);
        try { sessionStorage.setItem('cached_crm_tasks', JSON.stringify(d)); } catch {}
      }
      if (invoicesRes.ok) {
        const d = await invoicesRes.json();
        setInvoices(d);
        try { sessionStorage.setItem('cached_crm_invoices', JSON.stringify(d)); } catch {}
      }
      if (eventsRes.ok) {
        const d = await eventsRes.json();
        setEvents(d);
        try { sessionStorage.setItem('cached_crm_events', JSON.stringify(d)); } catch {}
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    if (activeWorkspace) {
      const saved = localStorage.getItem(`business_profile_${activeWorkspace.id}`);
      if (saved) {
        try {
          setBusinessProfile({ ...DEFAULT_BUSINESS_PROFILE, ...JSON.parse(saved) });
        } catch {}
      }
      fetch(`/api/workspaces/business-profile?workspaceId=${activeWorkspace.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(serverProfile => {
          if (serverProfile) {
            setBusinessProfile(prev => ({ ...prev, ...serverProfile }));
            localStorage.setItem(`business_profile_${activeWorkspace.id}`, JSON.stringify(serverProfile));
          }
        })
        .catch(() => {});
    }
  }, [activeWorkspace]);

  // Handle selected client detail sync
  const activeClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId) || null;
  }, [clients, selectedClientId]);

  useEffect(() => {
    if (activeClient) {
      setNotesText(activeClient.notes || '');
    }
  }, [activeClient]);

  // Invoice actions for preview modal
  const handleDeleteInvoice = async (id: string) => {
    if (!activeWorkspace) return;
    const ok = await confirm({
      title: 'Delete Invoice',
      message: 'Are you sure you want to delete this invoice? This record will be permanently deleted.',
      confirmText: 'Delete Invoice',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/crm/invoices?id=${id}&workspaceId=${activeWorkspace.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setInvoices(prev => prev.filter(inv => inv.id !== id));
        setPreviewingInvoice(null);
      } else {
        alert('Failed to delete invoice');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting invoice');
    }
  };

  const handleEditInvoice = (inv: any) => {
    setPreviewingInvoice(null);
    window.location.href = `/invoices?edit=${inv.id}`;
  };

  const handleUpdateInvoiceStatus = async (id: string, newStatus: any) => {
    if (!activeWorkspace) return;

    // 1. Instant optimistic update — 0ms
    setInvoices(prev => {
      const updated = prev.map(inv => inv.id === id ? { ...inv, status: newStatus } : inv);
      try { sessionStorage.setItem('cached_crm_invoices', JSON.stringify(updated)); } catch {}
      return updated;
    });
    if (previewingInvoice && previewingInvoice.id === id) {
      setPreviewingInvoice(prev => prev ? { ...prev, status: newStatus } : null);
    }

    // 2. Broadcast to other open pages (invoices page, etc.)
    try {
      const bc = new BroadcastChannel('docspace_invoice_status');
      bc.postMessage({ invoiceId: id, status: newStatus, workspaceId: activeWorkspace.id });
      bc.close();
    } catch {}

    // 3. Background server write
    try {
      const res = await fetch('/api/crm/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId: activeWorkspace.id, status: newStatus })
      });
      if (!res.ok) {
        console.error('Failed to update invoice status');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filter and sort clients list
  const filteredClients = useMemo(() => {
    const list = clients.filter(c => {
      // 1. Time filter based on when client was added
      if (!isWithinTimeFilter(c.createdAt, timeFilter)) return false;

      // 2. Custom collection/tag filter (when in Custom mode)
      if (sortBasis === 'custom' && selectedTagFilter !== 'all') {
        if (selectedTagFilter === 'untagged') {
          if (c.tags && c.tags.length > 0) return false;
        } else {
          if (!c.tags || !c.tags.includes(selectedTagFilter)) return false;
        }
      }

      // 3. Text query search (matches company, contact, email, industry, and tags)
      const query = clientSearch.toLowerCase();
      if (!query) return true;
      return (
        c.companyName.toLowerCase().includes(query) ||
        c.contactPerson.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        c.industry.toLowerCase().includes(query) ||
        (c.tags && c.tags.some(t => t.toLowerCase().includes(query)))
      );
    });

    // 4. Sorting
    return [...list].sort((a, b) => {
      if (sortBasis === 'recent') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBasis === 'alphabet') {
        return a.companyName.localeCompare(b.companyName);
      }
      if (sortBasis === 'custom') {
        // Tagged clients prioritized, active first, then most recently added
        if (a.status !== b.status) {
          return a.status === 'active' ? -1 : 1;
        }
        const aHasTags = (a.tags && a.tags.length > 0) ? 1 : 0;
        const bHasTags = (b.tags && b.tags.length > 0) ? 1 : 0;
        if (aHasTags !== bHasTags) {
          return bHasTags - aHasTags;
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });
  }, [clients, clientSearch, timeFilter, sortBasis, selectedTagFilter]);

  // Separate active and inactive clients
  const activeClients = useMemo(() => {
    return filteredClients.filter(c => c.status !== 'inactive');
  }, [filteredClients]);

  const inactiveClients = useMemo(() => {
    return filteredClients.filter(c => c.status === 'inactive');
  }, [filteredClients]);

  const displayedClients = clientSection === 'active' ? activeClients : inactiveClients;

  // Keep selected client valid based on current section
  useEffect(() => {
    const currentList = clientSection === 'active' ? activeClients : inactiveClients;
    if (currentList.length > 0) {
      if (!selectedClientId || !currentList.some(c => c.id === selectedClientId)) {
        setSelectedClientId(currentList[0].id);
      }
    } else if (selectedClientId && !clients.some(c => c.id === selectedClientId)) {
      setSelectedClientId(clients[0]?.id || '');
    }
  }, [clientSection, activeClients, inactiveClients, selectedClientId, clients]);

  // Quick toggle between Active and Inactive
  const handleToggleClientStatus = async (client: Client, newStatus: 'active' | 'inactive') => {
    if (!activeWorkspace) return;
    const prevStatus = (client.status || 'active') as 'active' | 'inactive';

    // 1. Instant optimistic update — 0ms
    const optimisticClient = { ...client, status: newStatus };
    setClients(prev => {
      const updated = prev.map(c => c.id === client.id ? optimisticClient : c);
      try { sessionStorage.setItem('cached_crm_clients', JSON.stringify(updated)); } catch {}
      return updated;
    });
    if (newStatus === 'inactive') {
      setClientSection('inactive');
      setSelectedClientId(client.id);
    } else {
      setClientSection('active');
      setSelectedClientId(client.id);
    }

    // 2. Record in sheetConfig immediately
    setSheetConfig(prev => {
      if (!prev) return prev;
      const nextChanges = { ...(prev.pendingClientChanges || {}) };
      const existing = nextChanges[client.id];
      const fieldDiffs = [
        ...(existing?.fieldDiffs?.filter(d => d.field !== 'status') || []),
        { field: 'status', label: 'Status', oldValue: prevStatus, newValue: newStatus }
      ];
      nextChanges[client.id] = {
        clientId: client.id,
        companyName: client.companyName,
        changeType: 'updated',
        details: `Status: ${prevStatus} → ${newStatus}`,
        changedAt: new Date().toISOString(),
        fieldDiffs
      };
      return {
        ...prev,
        pendingClientChanges: nextChanges,
        syncedClientIds: (prev.syncedClientIds || []).filter(id => id !== client.id)
      };
    });

    // 3. Broadcast to other open pages
    try {
      const bc = new BroadcastChannel('docspace_client_status');
      bc.postMessage({ clientId: client.id, status: newStatus, workspaceId: activeWorkspace.id });
      bc.close();
    } catch {}

    // 4. Background server write
    try {
      const res = await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, workspaceId: activeWorkspace.id, status: newStatus })
      });
      if (!res.ok) {
        // Revert
        setClients(prev => {
          const reverted = prev.map(c => c.id === client.id ? { ...c, status: prevStatus } : c);
          try { sessionStorage.setItem('cached_crm_clients', JSON.stringify(reverted)); } catch {}
          return reverted;
        });
        alert('Failed to update client status');
      } else {
        fetchSheetConfig();
      }
    } catch (err) {
      console.error(err);
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, status: prevStatus } : c));
      alert('Error updating client status');
    }
  };

  // Aggregate dossiers for selected client
  const linkedProjects = useMemo(() => {
    if (!selectedClientId) return [];
    return projects.filter(p => {
      if (p.clientId === selectedClientId) return true;
      return tasks.some(t => t.projectId === p.id && t.clientId === selectedClientId);
    });
  }, [projects, tasks, selectedClientId]);

  const linkedTasks = useMemo(() => {
    if (!selectedClientId) return [];
    return tasks.filter(t => t.clientId === selectedClientId);
  }, [tasks, selectedClientId]);

  const linkedInvoices = useMemo(() => {
    if (!selectedClientId) return [];
    return invoices.filter(i => i.clientId === selectedClientId);
  }, [invoices, selectedClientId]);

  const linkedTaxInvoices = useMemo(() => {
    return linkedInvoices.filter(inv => {
      const num = (inv.invoiceNumber || '').trim().toUpperCase();
      if (num.startsWith('PRO-') || num.startsWith('PROFORMA')) return false;
      try {
        if (inv.notes && inv.notes.startsWith('{')) {
          const m = JSON.parse(inv.notes);
          return m.docType !== 'proforma';
        }
      } catch {}
      return true;
    });
  }, [linkedInvoices]);

  const linkedProformaInvoices = useMemo(() => {
    return linkedInvoices.filter(inv => {
      const num = (inv.invoiceNumber || '').trim().toUpperCase();
      if (num.startsWith('PRO-') || num.startsWith('PROFORMA')) return true;
      try {
        if (inv.notes && inv.notes.startsWith('{')) {
          const m = JSON.parse(inv.notes);
          return m.docType === 'proforma';
        }
      } catch {}
      return false;
    });
  }, [linkedInvoices]);

  const linkedFiles = useMemo(() => {
    if (!selectedClientId) return [];
    // Aggregate attachments from tasks that belong to this client
    const files: any[] = [];
    linkedTasks.forEach(task => {
      if (task.attachments && task.attachments.length > 0) {
        task.attachments.forEach(att => {
          files.push({
            ...att,
            taskTitle: task.title,
            projectId: task.projectId
          });
        });
      }
    });
    return files;
  }, [linkedTasks]);

  const linkedEvents = useMemo(() => {
    if (!activeClient) return [];
    const contact = activeClient.contactPerson.toLowerCase();
    const company = activeClient.companyName.toLowerCase();
    return events.filter(e => {
      if (e.clientId === activeClient.id) return true;
      const title = e.title.toLowerCase();
      const desc = (e.description || '').toLowerCase();
      return title.includes(contact) || title.includes(company) || desc.includes(contact) || desc.includes(company);
    });
  }, [events, activeClient]);

  // Save client dossier notes
  const handleSaveNotes = async () => {
    if (!activeClient || !activeWorkspace) return;
    setSavingNotes(true);
    // Optimistic local update
    const prevNotes = activeClient.notes;
    setClients(prev => prev.map(c => c.id === activeClient.id ? { ...c, notes: notesText } : c));
    try {
      const res = await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeClient.id,
          workspaceId: activeWorkspace.id,
          notes: notesText
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
        fetchSheetConfig();
      } else {
        setClients(prev => prev.map(c => c.id === activeClient.id ? { ...c, notes: prevNotes } : c));
      }
    } catch (err) {
      console.error(err);
      setClients(prev => prev.map(c => c.id === activeClient.id ? { ...c, notes: prevNotes } : c));
    } finally {
      setSavingNotes(false);
    }
  };

  // Add client submit
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !formCompanyName.trim()) return;

    try {
      const res = await fetch('/api/crm/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          companyName: formCompanyName.trim(),
          contactPerson: formContactPerson.trim() || formCompanyName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim(),
          address: formAddress.trim(),
          website: formWebsite.trim(),
          industry: formIndustry.trim(),
          status: formStatus,
          notes: '',
          avatarUrl: formAvatarUrl || null,
          clientLocation: formClientLocation,
          clientType: formClientType,
          paymentSource: formPaymentSource,
          invoiceCurrency: formInvoiceCurrency,
          gstTreatmentOverride: formGstTreatmentOverride === 'none' ? null : formGstTreatmentOverride,
          gstNumber: formGstNumber.trim(),
          placeOfSupply: formPlaceOfSupply.trim(),
          tags: formTags
        })
      });

      if (res.ok) {
        const newClient = await res.json();
        setClients(prev => [...prev, newClient]);
        setSelectedClientId(newClient.id);
        setShowAddModal(false);
        resetForm();
        fetchSheetConfig();
      } else {
        alert('Failed to add client');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add client');
    }
  };

  // Edit client submit
  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !activeWorkspace) return;

    try {
      const res = await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeClient.id,
          workspaceId: activeWorkspace.id,
          companyName: formCompanyName.trim(),
          contactPerson: formContactPerson.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim(),
          address: formAddress.trim(),
          website: formWebsite.trim(),
          industry: formIndustry.trim(),
          status: formStatus,
          avatarUrl: formAvatarUrl || null,
          clientLocation: formClientLocation,
          clientType: formClientType,
          paymentSource: formPaymentSource,
          invoiceCurrency: formInvoiceCurrency,
          gstTreatmentOverride: formGstTreatmentOverride === 'none' ? null : formGstTreatmentOverride,
          gstNumber: formGstNumber.trim(),
          placeOfSupply: formPlaceOfSupply.trim(),
          tags: formTags,
          convertedFromLead: false,
          profileCompleted: true
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
        setShowEditModal(false);
        resetForm();
        fetchSheetConfig();
      } else {
        alert('Failed to update client');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update client');
    }
  };

  // Direct avatar update for active client
  const handleUpdateActiveClientAvatar = async (newAvatar: string | null) => {
    if (!activeClient || !activeWorkspace) return;
    setSavingAvatar(true);
    try {
      const res = await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeClient.id,
          workspaceId: activeWorkspace.id,
          avatarUrl: newAvatar
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
        setShowAvatarPickerModal(false);
        fetchSheetConfig();
      } else {
        alert('Failed to update client icon');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update client icon');
    } finally {
      setSavingAvatar(false);
    }
  };

  // Mark profile safe to leave as-is (dismisses incomplete profile alert)
  const handleMarkProfileSafe = async () => {
    if (!activeClient || !activeWorkspace) return;
    setMarkingSafe(true);
    try {
      const res = await fetch('/api/crm/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeClient.id,
          workspaceId: activeWorkspace.id,
          profileCompleted: true,
          convertedFromLead: false
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setClients(prev => {
          const next = prev.map(c => c.id === updated.id ? { ...c, ...updated, profileCompleted: true, convertedFromLead: false } : c);
          try { sessionStorage.setItem('cached_crm_clients', JSON.stringify(next)); } catch {}
          return next;
        });
        setShowMarkSafeModal(false);
        fetchSheetConfig();
      } else {
        alert('Failed to mark profile safe. Please try again.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while marking profile safe');
    } finally {
      setMarkingSafe(false);
    }
  };

  // Reusable avatar picker controls
  const renderAvatarPickerControls = (
    currentAvatar: string | null | undefined,
    onSelect: (val: string | null) => void,
    disabled: boolean = false
  ) => {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {renderClientAvatar(currentAvatar, formCompanyName || activeClient?.companyName || 'C', 'h-14 w-14 text-xl')}
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold transition-all shadow-xs ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}>
                <Upload className="h-3.5 w-3.5" />
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  disabled={disabled}
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const compressed = await compressImageFile(file);
                        onSelect(compressed);
                      } catch (err) {
                        alert('Could not process image');
                      }
                    }
                  }}
                />
              </label>
              {currentAvatar && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(null)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl transition-all cursor-pointer"
                >
                  Reset Initial
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">Upload logo image or choose a profile icon tag below</p>
          </div>
        </div>

        {/* Normal tags for profile icon */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
            Or Choose a Profile Icon Tag
          </label>
          <div className="grid grid-cols-7 gap-1.5">
            {PROFILE_TAG_ICONS.map(tag => (
              <button
                key={tag.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(tag.id)}
                title={tag.label}
                className={`p-2 rounded-xl text-lg flex items-center justify-center border transition-all cursor-pointer ${
                  currentAvatar === tag.id
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-white shadow-xs scale-105'
                    : 'border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tag.id}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Delete client
  const handleDeleteClient = async (id: string) => {
    if (!activeWorkspace) return;
    const targetClient = clients.find(c => c.id === id);
    setDeletingClient(true);
    try {
      const res = await fetch(`/api/crm/clients?id=${id}&workspaceId=${activeWorkspace.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        // Also remove row from Google Sheet if synced
        try {
          fetch('/api/crm/sheet-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId: activeWorkspace.id,
              action: 'delete_client',
              data: { id, companyName: targetClient?.companyName }
            })
          }).catch(() => {});
        } catch {}

        setClients(prev => prev.filter(c => c.id !== id));
        setTasks(prev => prev.filter(t => t.clientId !== id));
        setEvents(prev => prev.filter(e => e.clientId !== id));
        setInvoices(prev => prev.filter(i => i.clientId !== id));
        setProjects(prev => prev.filter(p => p.clientId !== id));

        try {
          sessionStorage.removeItem('cached_calendar_events');
          sessionStorage.removeItem('cached_calendar_clients');
          sessionStorage.removeItem('cached_crm_tasks');
          sessionStorage.removeItem('cached_crm_projects');
          sessionStorage.removeItem('cached_crm_clients');
          sessionStorage.removeItem('cached_projects_list');
          sessionStorage.removeItem('cached_projects_clients');
        } catch {}

        setShowDeleteModal(false);
        setShowEditModal(false);
        setDeleteConfirmName('');
        setDeleteConsentChecked(false);
        if (selectedClientId === id) {
          const remaining = clients.filter(c => c.id !== id);
          setSelectedClientId(remaining.length > 0 ? remaining[0].id : '');
        }
        fetchSheetConfig();
      } else {
        alert('Failed to delete client. Please try again.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while deleting client');
    } finally {
      setDeletingClient(false);
    }
  };

  const openAddMeeting = () => {
    if (!activeClient) return;
    setMeetingTitle(`Meeting with ${activeClient.companyName}`);
    const today = new Date().toISOString().split('T')[0];
    setMeetingDate(today);
    setMeetingStartTime('09:00');
    setMeetingEndTime('10:00');
    setMeetingLocation('');
    setMeetingDescription(`Discussion regarding projects and updates with ${activeClient.contactPerson}.`);
    setShowAddMeetingModal(true);
  };

  const handleAddMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !activeClient || !meetingTitle || !meetingDate) return;
    setCreatingMeeting(true);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          title: meetingTitle.trim(),
          startDateTime: `${meetingDate}T${meetingStartTime}:00`,
          endDateTime: `${meetingDate}T${meetingEndTime}:00`,
          type: 'meeting',
          location: meetingLocation.trim() || undefined,
          description: meetingDescription.trim() || undefined,
          clientId: activeClient.id
        }),
      });
      if (res.ok) {
        setShowAddMeetingModal(false);
        // Refetch calendar events!
        const eventsRes = await fetch(`/api/calendar?workspaceId=${activeWorkspace.id}`);
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } else {
        alert('Failed to save meeting event');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save meeting event');
    } finally {
      setCreatingMeeting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!activeWorkspace) return;
    const ok = await confirm({
      title: 'Cancel Calendar Meeting',
      message: 'Are you sure you want to cancel and delete this calendar meeting?',
      confirmText: 'Cancel Meeting',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/calendar?id=${eventId}&workspaceId=${activeWorkspace.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setEvents(prev => prev.filter(e => e.id !== eventId));
      } else {
        alert('Failed to cancel meeting event');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to cancel meeting event');
    }
  };

  const handleUpdateClientTaskStatus = async (taskId: string, nextStatus: string) => {
    if (!activeWorkspace) return;

    // 1. Instant optimistic update — 0ms response
    setTasks(prev => {
      const updated = prev.map(t => t.id === taskId ? { ...t, status: nextStatus as Task['status'] } : t);
      try { sessionStorage.setItem('cached_crm_tasks', JSON.stringify(updated)); } catch {}
      return updated;
    });

    // 2. Broadcast to other open pages (projects page, etc.) for instant cross-page sync
    try {
      const bc = new BroadcastChannel('docspace_task_status');
      bc.postMessage({ taskId, status: nextStatus, workspaceId: activeWorkspace.id });
      bc.close();
    } catch {}

    // 3. Single background server write — no fetchAllData
    try {
      const res = await fetch('/api/projects/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          id: taskId,
          status: nextStatus
        }),
      });
      if (!res.ok) {
        // Revert optimistic update on failure
        setTasks(prev => {
          const reverted = prev.map(t => t.id === taskId ? { ...t } : t);
          return reverted;
        });
        console.error('Failed to update task status — reverting');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openAddClient = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditClient = () => {
    if (!activeClient) return;
    setFormCompanyName(activeClient.companyName);
    setFormContactPerson(activeClient.contactPerson);
    setFormEmail(activeClient.email);
    setFormPhone(activeClient.phone);
    setFormAddress(activeClient.address || '');
    setFormWebsite(activeClient.website || '');
    setFormIndustry(activeClient.industry || '');
    setFormStatus(activeClient.status || 'active');
    setFormAvatarUrl(activeClient.avatarUrl || '');
    setFormClientLocation(activeClient.clientLocation || 'domestic');
    setFormClientType(activeClient.clientType || 'business');
    setFormPaymentSource(activeClient.paymentSource || 'indian_bank');
    setFormInvoiceCurrency(activeClient.invoiceCurrency || 'INR');
    setFormGstTreatmentOverride(activeClient.gstTreatmentOverride || 'none');
    setFormGstNumber(activeClient.gstNumber || '');
    setFormPlaceOfSupply(activeClient.placeOfSupply || '');
    setFormTags(activeClient.tags || []);
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormCompanyName('');
    setFormContactPerson('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormWebsite('');
    setFormIndustry('');
    setFormStatus('active');
    setFormAvatarUrl('');
    setFormClientLocation('domestic');
    setFormClientType('business');
    setFormPaymentSource('indian_bank');
    setFormInvoiceCurrency('INR');
    setFormGstTreatmentOverride('none');
    setFormGstNumber('');
    setFormPlaceOfSupply('');
    setFormTags([]);
  };

  // Billing math
  const billingStats = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    linkedInvoices.forEach(inv => {
      totalInvoiced += inv.total;
      if (inv.status === 'paid') {
        totalPaid += inv.total;
      }
    });
    return {
      invoiced: totalInvoiced,
      paid: totalPaid,
      balance: totalInvoiced - totalPaid
    };
  }, [linkedInvoices]);

  return (
    <div className="p-3 sm:p-4 md:p-8 flex flex-col gap-4 sm:gap-6 max-w-7xl mx-auto text-slate-800 dark:text-slate-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2">
            <Users2 className="h-6 w-6 sm:h-7 sm:w-7 text-slate-900 dark:text-white shrink-0" />
            Clients
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl">
            Maintain accounts dossier, track linked project stages, invoice collections, and shared explorer assets.
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
          {/* Open Google Sheet Button */}
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap"
              title="Open Google Sheet in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>Open Sheet</span>
            </a>
          )}

          {/* Sync to Sheet Button */}
          <button
            type="button"
            onClick={openSyncSelectionModal}
            disabled={isSyncingClientsToSheet}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap"
            title="Choose and sync clients to Google Sheet 'Clients' tab"
          >
            {isSyncingClientsToSheet ? (
              <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-emerald-600 shrink-0" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 shrink-0" />
            )}
            <span>{isSyncingClientsToSheet ? 'Syncing...' : 'Sync to Sheet'}</span>
          </button>

          {/* Changes Notification Button & Dropdown */}
          <div className="relative" ref={changesDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowChangesDropdown(prev => !prev);
                if (!showChangesDropdown) {
                  setSelectedChangesSyncIds(pendingChangesList.map(c => c.clientId));
                }
              }}
              className={`relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 border rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-semibold shadow-2xs transition-all cursor-pointer whitespace-nowrap ${
                pendingChangesList.length > 0
                  ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/90 hover:bg-amber-100/90 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 ring-2 ring-amber-400/20'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
              title={
                pendingChangesList.length > 0
                  ? `${pendingChangesList.length} unsynced client change${pendingChangesList.length > 1 ? 's' : ''}`
                  : 'All client changes are synced'
              }
            >
              <Bell className={`h-3.5 w-3.5 shrink-0 ${pendingChangesList.length > 0 ? 'text-amber-600 dark:text-amber-400 animate-bounce' : 'text-slate-400'}`} />
              <span>Changes</span>
              {pendingChangesList.length > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                  {pendingChangesList.length}
                </span>
              )}
            </button>

            {/* Dropdown Popover */}
            {showChangesDropdown && (
              <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[480px] md:w-[520px] max-w-[520px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-950/40">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300">
                      <Bell className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Pending Changes</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                          {pendingChangesList.length} to sync
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Selective sync pushes only the modified clients to Google Sheet
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowChangesDropdown(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Content */}
                {pendingChangesList.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="h-10 w-10 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center mb-2.5">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Everything is in sync</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                      All clients match your Google Sheet. New additions or edits will appear here for one-click selective sync.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Bulk Selection Bar */}
                    <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-medium">
                        <input
                          type="checkbox"
                          checked={selectedChangesSyncIds.length === pendingChangesList.length && pendingChangesList.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedChangesSyncIds(pendingChangesList.map(c => c.clientId));
                            } else {
                              setSelectedChangesSyncIds([]);
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span>Select All ({pendingChangesList.length})</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => syncSpecificClients(selectedChangesSyncIds.length > 0 ? selectedChangesSyncIds : pendingChangesList.map(c => c.clientId))}
                        disabled={isSyncingClientsToSheet}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        {isSyncingClientsToSheet && !syncingSingleClientId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {selectedChangesSyncIds.length === pendingChangesList.length || selectedChangesSyncIds.length === 0
                            ? `Sync All (${pendingChangesList.length})`
                            : `Sync Selected (${selectedChangesSyncIds.length})`}
                        </span>
                      </button>
                    </div>

                    {/* Scrollable List of Changed Clients */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                      {pendingChangesList.map((item) => {
                        const isSelected = selectedChangesSyncIds.includes(item.clientId);
                        const isThisSyncing = isSyncingClientsToSheet && syncingSingleClientId === item.clientId;

                        return (
                          <div
                            key={item.clientId}
                            className="p-3.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors flex items-start justify-between gap-3"
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  setSelectedChangesSyncIds(prev =>
                                    e.target.checked
                                      ? [...prev, item.clientId]
                                      : prev.filter(id => id !== item.clientId)
                                  );
                                }}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0 mt-0.5"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                                    {item.companyName}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                      item.changeType === 'created'
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60'
                                    }`}
                                  >
                                    {item.changeType === 'created' ? 'New' : 'Edited'}
                                  </span>
                                </div>

                                {/* Exact Field Changes Badges */}
                                {item.fieldDiffs && item.fieldDiffs.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {item.fieldDiffs.map((diff, dIdx) => (
                                      <div
                                        key={dIdx}
                                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-mono shadow-2xs"
                                        title={`${diff.label}: ${diff.oldValue ? `${diff.oldValue} → ` : ''}${diff.newValue}`}
                                      >
                                        <span className="font-sans font-bold text-slate-500 dark:text-slate-400">{diff.label}:</span>
                                        {diff.oldValue ? (
                                          <>
                                            <span className="line-through text-rose-500/80 dark:text-rose-400/80 max-w-[110px] truncate">{diff.oldValue}</span>
                                            <span className="text-slate-400 dark:text-slate-500">→</span>
                                          </>
                                        ) : null}
                                        <span className="font-bold text-emerald-700 dark:text-emerald-400 max-w-[140px] truncate">
                                          {diff.newValue || '(empty)'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                    {item.details}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Single Sync Button */}
                            <button
                              type="button"
                              onClick={() => syncSpecificClients([item.clientId])}
                              disabled={isSyncingClientsToSheet}
                              className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 transition-all cursor-pointer disabled:opacity-50 mt-0.5"
                              title={`Sync only ${item.companyName} to Google Sheet`}
                            >
                              {isThisSyncing ? (
                                <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                              ) : (
                                <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                              )}
                              <span>{isThisSyncing ? 'Syncing...' : 'Sync'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer Tip */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Selective sync updates only the chosen records without altering the rest of your sheet.</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {!isReadOnly && (
            <button
              type="button"
              onClick={openAddClient}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-slate-900 dark:bg-slate-100 hover:opacity-90 text-white dark:text-slate-900 flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
              title="Add New Client"
            >
              <Plus className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </button>
          )}
        </div>
      </div>

      {/* Toast Feedback banner */}
      {clientSheetFeedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200 animate-in fade-in duration-150 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">{clientSheetFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setClientSheetFeedback(null)}
            className="text-emerald-500 hover:text-emerald-700 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Mobile View Switcher (visible on mobile < lg) */}
      <div className="flex lg:hidden items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl text-xs font-bold w-full shrink-0">
        <button
          type="button"
          onClick={() => setMobileView('list')}
          className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileView === 'list'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Users2 className="h-3.5 w-3.5" />
          <span>Clients ({mounted ? (clientSection === 'active' ? activeClients.length : inactiveClients.length) : 0})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileView('detail')}
          disabled={!activeClient}
          className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            !activeClient
              ? 'opacity-40 cursor-not-allowed text-slate-400'
              : mobileView === 'detail'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span className="truncate max-w-[130px]">{activeClient ? activeClient.companyName : 'Portfolio Dossier'}</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[20.5rem_1fr] gap-4 sm:gap-6 items-start">
        
        {/* Left Side Client Selection List */}
        <div className={`${mobileView === 'detail' ? 'hidden lg:flex' : 'flex'} bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl flex-col overflow-hidden shadow-sm`}>
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
            {/* Top row: Section toggle (Active vs Inactive) + Sort selector */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setClientSection('active');
                    if (activeClients.length > 0 && (!selectedClientId || !activeClients.some(c => c.id === selectedClientId))) {
                      setSelectedClientId(activeClients[0].id);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    clientSection === 'active'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span>Active</span>
                  <span suppressHydrationWarning className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                    clientSection === 'active'
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-slate-200/70 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {mounted ? activeClients.length : 0}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setClientSection('inactive');
                    if (inactiveClients.length > 0 && (!selectedClientId || !inactiveClients.some(c => c.id === selectedClientId))) {
                      setSelectedClientId(inactiveClients[0].id);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    clientSection === 'inactive'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span>Inactive</span>
                  <span suppressHydrationWarning className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                    clientSection === 'inactive'
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-955/40 dark:text-rose-400'
                      : 'bg-slate-200/70 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {mounted ? inactiveClients.length : 0}
                  </span>
                </button>
              </div>

              {/* Sort selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg text-[10px]">
                <button
                  type="button"
                  onClick={() => setSortBasis('recent')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    sortBasis === 'recent'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Sort by recently added"
                >
                  Recent
                </button>
                <button
                  type="button"
                  onClick={() => setSortBasis('alphabet')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    sortBasis === 'alphabet'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Sort alphabetically (A to Z)"
                >
                  A-Z
                </button>
                <button
                  type="button"
                  onClick={() => setSortBasis('custom')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                    sortBasis === 'custom'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Custom collections and tags (Important, High Ticket, Low Ticket, etc.)"
                >
                  Custom
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder={clientSection === 'active' ? "Search active clients..." : "Search inactive clients..."}
                className="w-full pl-9 pr-7 py-1.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
                style={{ paddingLeft: '2.35rem' }}
              />
              {clientSearch && (
                <button
                  type="button"
                  onClick={() => setClientSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Date Filter Toggle Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-[10px]">
              {TIME_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTimeFilter(opt.id)}
                  className={`px-2 py-0.5 rounded-lg font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    timeFilter === opt.id
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Dedicated Collections Bar when Custom view is active */}
            {sortBasis === 'custom' && (
              <div className="pt-2 pb-1 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Tag className="h-3 w-3 text-indigo-500" /> Collections & Tags
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowManageTagsModal(true)}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Manage Tags
                  </button>
                </div>
                
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSelectedTagFilter('all')}
                    className={`px-2 py-1 rounded-lg font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      selectedTagFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>All</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedTagFilter === 'all' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {clients.filter(c => clientSection === 'active' ? c.status !== 'inactive' : c.status === 'inactive').length}
                    </span>
                  </button>

                  {customTags.map(tag => {
                    const count = clients.filter(c => (clientSection === 'active' ? c.status !== 'inactive' : c.status === 'inactive') && c.tags?.includes(tag)).length;
                    const isSelected = selectedTagFilter === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedTagFilter(tag)}
                        className={`px-2 py-1 rounded-lg font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                          isSelected
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-xs'
                            : 'bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <span>{tag}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected ? 'bg-white/20 text-white dark:bg-slate-800 dark:text-slate-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setSelectedTagFilter('untagged')}
                    className={`px-2 py-1 rounded-lg font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      selectedTagFilter === 'untagged'
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>Untagged</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                      selectedTagFilter === 'untagged' ? 'bg-white/20 text-white dark:bg-slate-800 dark:text-slate-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {clients.filter(c => (clientSection === 'active' ? c.status !== 'inactive' : c.status === 'inactive') && (!c.tags || c.tags.length === 0)).length}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="max-h-[32rem] overflow-y-auto no-scrollbar p-2 space-y-1">
            {loading && clients.length === 0 ? (
              <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : displayedClients.length === 0 ? (
              <div className="py-8 text-center px-4 space-y-2">
                <p className="text-xs text-slate-400 italic">No {clientSection} client profiles found.</p>
                {clientSection === 'active' && inactiveClients.length > 0 && (
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => {
                      setClientSection('inactive');
                      setSelectedClientId(inactiveClients[0].id);
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                  >
                    View Inactive Clients ({mounted ? inactiveClients.length : 0}) →
                  </button>
                )}
                {clientSection === 'inactive' && activeClients.length > 0 && (
                  <button
                    type="button"
                    suppressHydrationWarning
                    onClick={() => {
                      setClientSection('active');
                      setSelectedClientId(activeClients[0].id);
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                  >
                    ← Back to Active Clients ({mounted ? activeClients.length : 0})
                  </button>
                )}
              </div>
            ) : (
              <>
                {clientSection === 'inactive' && (
                  <div className="px-2.5 py-1.5 mb-1.5 bg-rose-50/70 dark:bg-rose-955/20 border border-rose-200/60 dark:border-rose-900/30 rounded-xl flex items-center justify-between text-[11px]">
                    <span suppressHydrationWarning className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-bold text-[10px] uppercase tracking-wider">
                      <UserX className="h-3.5 w-3.5" /> Inactive Section ({mounted ? inactiveClients.length : 0})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setClientSection('active');
                        if (activeClients.length > 0) setSelectedClientId(activeClients[0].id);
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 font-bold underline cursor-pointer"
                    >
                      Back to Active
                    </button>
                  </div>
                )}

                {displayedClients.map(client => {
                  const isSelected = selectedClientId === client.id;
                  const isInactive = client.status === 'inactive';
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => { setSelectedClientId(client.id); setActiveTab('info'); setMobileView('detail'); }}
                      className={`w-full text-left p-2.5 rounded-xl transition-all border flex items-center justify-between gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-950 dark:border-slate-100 shadow-sm'
                          : isInactive
                          ? 'border-transparent bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                          : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2.5">
                        {renderClientAvatar(
                          client.avatarUrl,
                          client.companyName,
                          `h-8 w-8 text-xs !rounded-lg shrink-0 ${isSelected ? '!border-white/20' : isInactive ? 'opacity-70 grayscale-[30%]' : ''}`
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold truncate leading-tight flex items-center gap-1.5">
                              {client.companyName}
                              {isInactive && (
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-rose-100 dark:bg-rose-955/40 text-rose-600 dark:text-rose-400'
                                }`}>
                                  Inactive
                                </span>
                              )}
                            </p>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isInactive ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className={`text-[10px] truncate ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                              {client.contactPerson || 'No contact'}
                            </p>
                            {client.createdAt && (
                              <span className={`text-[9px] shrink-0 font-medium ${isSelected ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                                {formatAddedDate(client.createdAt)}
                              </span>
                            )}
                          </div>
                          {client.tags && client.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {client.tags.slice(0, 2).map(tag => (
                                <span
                                  key={tag}
                                  className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded-md border ${
                                    isSelected
                                      ? 'bg-white/20 text-white border-white/30'
                                      : getTagBadgeClass(tag)
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                              {client.tags.length > 2 && (
                                <span className={`text-[8.5px] font-bold px-1 py-0.2 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                  +{client.tags.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Footer drawer link to Inactive section when in Active view */}
          {clientSection === 'active' && inactiveClients.length > 0 && (
            <div className="p-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/20">
              <button
                type="button"
                onClick={() => {
                  setClientSection('inactive');
                  if (inactiveClients.length > 0) setSelectedClientId(inactiveClients[0].id);
                }}
                className="w-full py-2 px-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-xl text-[11px] font-semibold flex items-center justify-between transition-all cursor-pointer border border-dashed border-slate-200 dark:border-slate-800 shadow-2xs group"
              >
                <span className="flex items-center gap-2">
                  <Archive className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                  <span suppressHydrationWarning>Inactive Clients ({mounted ? inactiveClients.length : 0})</span>
                </span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  View <ArrowRight className="h-3 w-3" />
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Right Side Portfolio dossier */}
        <div className={`${mobileView === 'list' ? 'hidden lg:flex' : 'flex'} bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl min-h-[35rem] flex-col overflow-hidden shadow-sm`}>
          {!activeClient ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center text-slate-400">
              <Users2 className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-xs font-bold">Select Client Portfolio</p>
              <p className="text-[10px] mt-1">Select a client profile from the list to manage connected documents, projects, and invoices.</p>
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="mt-4 lg:hidden px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Mobile Back Button Bar */}
              <div className="lg:hidden px-3.5 py-2 bg-slate-50 dark:bg-slate-955/60 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileView('list')}
                  className="h-8 w-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs cursor-pointer flex items-center justify-center transition-all"
                  title="Go back"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[220px]">
                  {activeClient.companyName}
                </span>
              </div>

              {/* Header profile title block */}
              <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
                <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
                  {/* Clickable Avatar to quickly change icon or image */}
                  <div className="relative group shrink-0">
                    {renderClientAvatar(activeClient.avatarUrl, activeClient.companyName, 'h-12 w-12 sm:h-16 sm:w-16 text-xl sm:text-2xl')}
                    <button
                      type="button"
                      onClick={() => setShowAvatarPickerModal(true)}
                      className="absolute inset-0 rounded-2xl bg-slate-950/65 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[1px]"
                      title="Change Profile Icon"
                    >
                      <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="text-[7.5px] sm:text-[8px] font-bold mt-0.5">Change</span>
                    </button>
                  </div>

                  <div className="space-y-1 sm:space-y-1.5 min-w-0 flex-1">
                    {/* Big Client Name */}
                    <h2 className="text-xl sm:text-3xl font-black tracking-tight leading-tight text-slate-900 dark:text-white truncate">
                      {activeClient.companyName}
                    </h2>

                    {/* Metadata & badges cleanly arranged below the name */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {activeClient.clientLocation && activeClient.clientType ? (
                        <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                          {classifyClientCategory(activeClient.clientLocation, activeClient.clientType)}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
                          Profile Incomplete
                        </span>
                      )}

                      {activeClient.clientLocation ? (
                        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                          (activeClient.gstTreatmentOverride || determineGSTTreatment(activeClient.clientLocation, activeClient.paymentSource || 'indian_bank').gstTreatment) === 'lut_export'
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60'
                        }`}>
                          {(activeClient.gstTreatmentOverride || determineGSTTreatment(activeClient.clientLocation, activeClient.paymentSource || 'indian_bank').gstTreatment) === 'lut_export'
                            ? 'LUT / Export (0% GST)'
                            : 'GST Applicable (18%)'}
                        </span>
                      ) : null}

                      {activeClient.industry ? (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5 truncate">
                            <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {activeClient.industry}
                          </p>
                        </>
                      ) : null}
                    </div>

                    {/* Collections / Tags Row with Add/Move Popover */}
                    <div className="tag-popover-container relative flex flex-wrap items-center gap-1.5 pt-1">
                      <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {activeClient.tags && activeClient.tags.length > 0 ? (
                        activeClient.tags.map(tag => (
                          <span
                            key={tag}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${getTagBadgeClass(tag)}`}
                          >
                            <span>{tag}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleClientTag(activeClient, tag)}
                              className="hover:opacity-75 cursor-pointer ml-0.5 text-[11px] leading-none"
                              title={`Remove "${tag}"`}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No collection tags assigned</span>
                      )}

                      {/* Tag / Move Button */}
                      <button
                        type="button"
                        onClick={() => setTagMenuClientId(tagMenuClientId === activeClient.id ? null : activeClient.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-200/80 dark:border-slate-700"
                        title="Add, remove or move to another collection"
                      >
                        <Plus className="h-3 w-3" /> Tag / Move to...
                      </button>

                      {/* Popover Menu */}
                      {tagMenuClientId === activeClient.id && (
                        <div
                          className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <Tag className="h-3.5 w-3.5 text-indigo-500" /> Collections & Tags
                            </span>
                            <button
                              type="button"
                              onClick={() => setTagMenuClientId(null)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Toggle existing tags */}
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Toggle Membership</p>
                            <div className="space-y-1 max-h-36 overflow-y-auto no-scrollbar">
                              {customTags.map(tag => {
                                const isTagged = activeClient.tags?.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => handleToggleClientTag(activeClient, tag)}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                                      isTagged
                                        ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
                                        : 'bg-slate-50/70 dark:bg-slate-950/40 border-slate-100 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 truncate">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${isTagged ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                      <span className="truncate">{tag}</span>
                                    </span>
                                    {isTagged && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Move To Exclusively */}
                          <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Move Exclusively To...</p>
                            <div className="grid grid-cols-2 gap-1 max-h-28 overflow-y-auto no-scrollbar">
                              {customTags.map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    handleMoveClientToTag(activeClient, tag);
                                    setTagMenuClientId(null);
                                  }}
                                  className="px-2 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-semibold truncate text-left transition-colors cursor-pointer border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800"
                                  title={`Move client to ${tag}`}
                                >
                                  → {tag}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quick add custom tag / manage */}
                          <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                setTagMenuClientId(null);
                                setShowManageTagsModal(true);
                              }}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" /> Create / Manage Tags
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {activeClient.status === 'inactive' ? (
                    <button
                      type="button"
                      onClick={() => handleToggleClientStatus(activeClient, 'active')}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-955/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-all cursor-pointer shadow-2xs"
                      title="Reactivate this client into the active list"
                    >
                      <Check className="h-3.5 w-3.5" /> Mark Active
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Mark Client as Inactive',
                          message: `Move "${activeClient.companyName}" to Inactive Clients section? Its chats will be moved to the Inactive tab.`,
                          confirmText: 'Mark Inactive',
                          variant: 'warning',
                        });
                        if (ok) {
                          handleToggleClientStatus(activeClient, 'inactive');
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all cursor-pointer shadow-2xs"
                      title="Move this client to the inactive section"
                    >
                      <Archive className="h-3.5 w-3.5" /> Mark Inactive
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={openEditClient}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all cursor-pointer shadow-2xs"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                </div>
              </div>

              {/* Notification Banner for Converted Lead or Incomplete Client Information */}
              {!activeClient.profileCompleted && (activeClient.convertedFromLead || !activeClient.clientLocation || !activeClient.address) && (
                <div className="mx-3.5 sm:mx-6 mt-4 p-3.5 sm:p-4 bg-amber-50/90 dark:bg-amber-955/20 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl text-xs shadow-2xs">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div>
                        <p className="font-bold text-amber-900 dark:text-amber-100 text-xs">
                          {activeClient.convertedFromLead ? 'New Client Converted from Lead' : 'Client Profile Incomplete'}
                        </p>
                        <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 mt-0.5 leading-relaxed">
                          {activeClient.convertedFromLead
                            ? 'Only initial lead details were added. Additional business info, address, and GST/Tax classification have not been configured yet.'
                            : 'Please configure missing business information, address, and GST settings for this client.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setShowMarkSafeModal(true)}
                          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-300/90 dark:border-amber-800/80 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> Mark Safe to Leave
                        </button>
                        <button
                          type="button"
                          onClick={openEditClient}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> Edit Client Details
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Inactive Notice Banner */}
              {activeClient.status === 'inactive' && (
                <div className="mx-3.5 sm:mx-6 mt-4 p-3 bg-rose-50/70 dark:bg-rose-955/20 border border-rose-200/70 dark:border-rose-900/40 rounded-2xl flex items-center justify-between gap-3 text-xs shrink-0">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-medium">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>This client account is <strong>Inactive</strong> and separated from your active client list.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleClientStatus(activeClient, 'active')}
                    className="shrink-0 px-3 py-1 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-xl text-[11px] font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" /> Reactivate Client
                  </button>
                </div>
              )}

              {/* Tabs list */}
              <div className="px-3 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex gap-1 sm:gap-2 overflow-x-auto shrink-0 scrollbar-none no-scrollbar">
                {([
                  { id: 'info', label: 'Info & Dossier', icon: Info },
                  { id: 'projects', label: `Projects (${mounted ? linkedProjects.length : 0})`, icon: FolderCheck },
                  { id: 'invoices', label: `Invoices (${mounted ? linkedTaxInvoices.length : 0})`, icon: ReceiptText },
                  { id: 'proforma', label: `Proforma Invoice (${mounted ? linkedProformaInvoices.length : 0})`, icon: FileSpreadsheet },
                  { id: 'billing', label: `Billing & Ledger`, icon: DollarSign },
                  { id: 'files', label: `Files (${mounted ? linkedFiles.length : 0})`, icon: FileText },
                  { id: 'events', label: `Events (${mounted ? linkedEvents.length : 0})`, icon: Calendar },
                ] as const).map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      suppressHydrationWarning
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 py-3 sm:py-4 px-2 sm:px-2.5 border-b-2 text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-black'
                          : 'border-transparent text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab panels workspace */}
              <div className="flex-1 p-3.5 sm:p-6 overflow-y-auto no-scrollbar">
                
                {/* 1. INFO & DOSSIER TAB */}
                {activeTab === 'info' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-150/40 dark:border-slate-850 space-y-3.5">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><Info className="h-3.5 w-3.5" /> Contact Details</h4>
                        
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Contact Person</span>
                            <span className="font-semibold">{activeClient.contactPerson}</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Email Address</span>
                            <a href={`mailto:${activeClient.email}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:underline flex items-center gap-1">
                              {activeClient.email} <Mail className="h-3 w-3" />
                            </a>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Phone Number</span>
                            <a href={`tel:${activeClient.phone}`} className="font-semibold hover:underline flex items-center gap-1">
                              {activeClient.phone} <Phone className="h-3 w-3" />
                            </a>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Website URL</span>
                            {activeClient.website ? (
                              <a href={activeClient.website.startsWith('http') ? activeClient.website : `https://${activeClient.website}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-900 dark:text-slate-100 hover:underline flex items-center gap-1">
                                {activeClient.website} <Globe className="h-3 w-3" />
                              </a>
                            ) : <span>—</span>}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50/50 dark:bg-slate-955/20 p-4 rounded-2xl border border-slate-150/40 dark:border-slate-850 space-y-3.5">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Business Info</h4>
                        
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Address Location</span>
                            <span className="font-semibold truncate max-w-[180px]" title={activeClient.address}>{activeClient.address || '—'}</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Industry / Niche</span>
                            <span className="font-semibold">{activeClient.industry || '—'}</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Account Status</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              activeClient.status === 'inactive' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>{activeClient.status || 'Active'}</span>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-400">Created Date</span>
                            <span className="font-semibold text-slate-500">{new Date(activeClient.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                            <div className="flex justify-between items-center gap-2 text-[11px]">
                              <span className="text-slate-400">Location Classification</span>
                              <span className="font-bold capitalize">{activeClient.clientLocation || <span className="text-slate-400 font-normal italic">Not set</span>}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2 text-[11px]">
                              <span className="text-slate-400">Client Type</span>
                              <span className="font-bold capitalize">{activeClient.clientType || <span className="text-slate-400 font-normal italic">Not set</span>}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2 text-[11px]">
                              <span className="text-slate-400">Default Currency</span>
                              <span className="font-bold uppercase">{activeClient.invoiceCurrency || <span className="text-slate-400 font-normal italic">Not set</span>}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2 text-[11px]">
                              <span className="text-slate-400">Default Payment Source</span>
                              <span className="font-bold capitalize">{activeClient.paymentSource ? activeClient.paymentSource.replace('_', ' ') : <span className="text-slate-400 font-normal italic">Not set</span>}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2 text-[11px]">
                              <span className="text-slate-400">GSTIN / Tax ID</span>
                              <span className="font-bold uppercase">{activeClient.gstNumber || '—'}</span>
                            </div>
                            <div className="flex justify-between items-center gap-2 text-[11px]">
                              <span className="text-slate-400">Place of Supply</span>
                              <span className="font-bold">{activeClient.placeOfSupply || '—'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Dossier notes editor section */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Client Portfolio Notes / Dossier</h4>
                      <div className="bg-slate-50/30 dark:bg-slate-955/10 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        <textarea
                          value={notesText}
                          onChange={e => setNotesText(e.target.value)}
                          placeholder="Maintain important context, special deals history, or specific client rules..."
                          rows={6}
                          className="w-full bg-transparent text-xs text-slate-750 dark:text-slate-200 focus:outline-none resize-none leading-relaxed"
                        />
                        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-805">
                          <button
                            onClick={handleSaveNotes}
                            disabled={savingNotes}
                            className="flex items-center gap-1 px-4 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                          >
                            {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Save Notes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. PROJECTS & STAGES TAB */}
                {activeTab === 'projects' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Client Projects ({linkedProjects.length})</span>
                      <a
                        href="/projects"
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold hover:opacity-90 transition-opacity"
                      >
                        <Plus className="h-3 w-3" /> Go to Projects
                      </a>
                    </div>
                    {linkedProjects.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 text-xs italic space-y-3">
                        <p>No projects linked to this client yet.</p>
                        <a
                          href="/projects"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold not-italic hover:bg-slate-200 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Create Project & Assign Client
                        </a>
                      </div>
                    ) : (
                      linkedProjects.map(proj => {
                        // stages matching this client
                        const projTasks = linkedTasks.filter(t => t.projectId === proj.id);
                        const completedCount = projTasks.filter(t => t.status === 'done').length;
                        const progressPct = projTasks.length > 0 ? Math.round((completedCount / projTasks.length) * 100) : 0;
                        
                        return (
                          <div key={proj.id} className="bg-slate-50/50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-150/40 dark:border-slate-850 space-y-4">
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-105">{proj.name}</h3>
                                <p className="text-[10px] text-slate-400 mt-1 max-w-xl">{proj.description || 'No overview provided.'}</p>
                              </div>
                              <div className="text-right">
                                <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                  proj.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                                  proj.status === 'active' ? 'bg-blue-50 text-blue-600' : 'bg-slate-105 text-slate-500'
                                }`}>{proj.status}</span>
                                <p className="text-[10px] font-bold text-slate-500 mt-1.5">₹{proj.budget.toLocaleString()}</p>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-black text-slate-450 uppercase tracking-wider">
                                <span>Stages Completion</span>
                                <span>{completedCount} / {projTasks.length} ({progressPct}%)</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden shadow-inner">
                                <div
                                  className="bg-slate-900 dark:bg-slate-100 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>

                            {/* Grouped stages list */}
                            {projTasks.length > 0 && (
                              <div className="pt-3 border-t border-slate-200/50 dark:border-slate-850 space-y-2">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Client Checklist Items</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {projTasks.map(task => (
                                    <div key={task.id} className="p-2.5 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-850 rounded-xl flex items-center justify-between text-[11px] hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                                      <span className={`truncate font-semibold ${task.status === 'done' ? 'line-through text-slate-400 font-normal' : ''}`}>{task.title}</span>
                                      <select
                                        value={task.status}
                                        onChange={(e) => handleUpdateClientTaskStatus(task.id, e.target.value)}
                                        className="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-955 border border-slate-205 dark:border-slate-800 rounded-xl text-[9px] font-bold text-slate-750 dark:text-slate-300 focus:outline-none transition-all cursor-pointer shrink-0"
                                      >
                                        <option value="todo">Not Started</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="review">Review</option>
                                        <option value="done">Completed</option>
                                      </select>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* 3. TAX INVOICES TAB */}
                {activeTab === 'invoices' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <ReceiptText className="h-4 w-4 text-slate-900 dark:text-slate-100" />
                          Client Tax Invoices ({linkedTaxInvoices.length})
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Formal tax invoices billed to this client account.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeClient) return;
                          window.location.href = `/invoices?new=true&clientId=${activeClient.id}&docType=invoice`;
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer hover:opacity-90"
                      >
                        <Plus className="h-3.5 w-3.5" /> Generate Invoice
                      </button>
                    </div>

                    {linkedTaxInvoices.length === 0 ? (
                      <p className="text-center py-12 text-xs text-slate-400 italic">No formal tax invoices recorded for this client yet.</p>
                    ) : (
                      <div className="border border-slate-250 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                        <div className="overflow-x-auto w-full no-scrollbar">
                          <table className="w-full min-w-[500px] text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50/50 dark:bg-slate-955/20 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-500">
                                <th className="p-3">Invoice Number</th>
                                <th className="p-3">Issue Date</th>
                                <th className="p-3">Due Date</th>
                                <th className="p-3">Total Amount</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linkedTaxInvoices.map(inv => (
                                <tr
                                  key={inv.id}
                                  onClick={() => setPreviewingInvoice(inv)}
                                  className="border-b border-slate-100 dark:border-slate-850 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                                >
                                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Invoice {inv.invoiceNumber}</td>
                                  <td className="p-3 text-slate-500">{new Date(inv.issueDate).toLocaleDateString()}</td>
                                  <td className="p-3 text-slate-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                                  <td className="p-3 font-bold">₹{inv.total.toLocaleString()}</td>
                                  <td className="p-3 text-center">
                                    <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                                      inv.status === 'overdue' ? 'bg-rose-50 text-rose-600' :
                                      'bg-amber-50 text-amber-600'
                                    }`}>{inv.status}</span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewingInvoice(inv);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-[10px] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-bold transition-all cursor-pointer shadow-2xs"
                                    >
                                      <Eye className="h-3 w-3" /> View Ledger
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. PROFORMA INVOICE TAB */}
                {activeTab === 'proforma' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileSpreadsheet className="h-4 w-4 text-slate-900 dark:text-slate-100" />
                          Client Proforma Invoices ({linkedProformaInvoices.length})
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Pre-invoices / estimates issued to this client before delivery.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeClient) return;
                          window.location.href = `/invoices?new=true&clientId=${activeClient.id}&docType=proforma`;
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer hover:opacity-90"
                      >
                        <Plus className="h-3.5 w-3.5" /> Create Proforma
                      </button>
                    </div>

                    {linkedProformaInvoices.length === 0 ? (
                      <p className="text-center py-12 text-xs text-slate-400 italic">No proforma invoices recorded for this client. Create one from the Billing generator.</p>
                    ) : (
                      <div className="border border-slate-250 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                        <div className="overflow-x-auto w-full no-scrollbar">
                          <table className="w-full min-w-[500px] text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50/50 dark:bg-slate-955/20 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-500">
                                <th className="p-3">Doc Number</th>
                                <th className="p-3">Issue Date</th>
                                <th className="p-3">Valid Until</th>
                                <th className="p-3">Total Amount</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linkedProformaInvoices.map(inv => (
                                <tr
                                  key={inv.id}
                                  onClick={() => setPreviewingInvoice(inv)}
                                  className="border-b border-slate-100 dark:border-slate-850 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                                >
                                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">Proforma {inv.invoiceNumber}</td>
                                  <td className="p-3 text-slate-500">{new Date(inv.issueDate).toLocaleDateString()}</td>
                                  <td className="p-3 text-slate-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                                  <td className="p-3 font-bold">₹{inv.total.toLocaleString()}</td>
                                  <td className="p-3 text-center">
                                    <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                                      inv.status === 'overdue' ? 'bg-rose-50 text-rose-600' :
                                      'bg-amber-50 text-amber-600'
                                    }`}>{inv.status}</span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewingInvoice(inv);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-[10px] text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 font-bold transition-all cursor-pointer shadow-2xs"
                                    >
                                      <Eye className="h-3 w-3" /> View in Ledger
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. BILLING & LEDGER TAB */}
                {activeTab === 'billing' && (
                  <div className="space-y-6">
                    
                    {/* Stats strip */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      
                      <div className="p-4 bg-slate-50/50 dark:bg-slate-955/20 border border-slate-150/40 dark:border-slate-850 rounded-2xl flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-805 flex items-center justify-center shrink-0">
                          <DollarSign className="h-4.5 w-4.5 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Invoiced</p>
                          <p className="text-sm font-black mt-0.5">₹{billingStats.invoiced.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50/50 dark:bg-slate-955/20 border border-slate-150/40 dark:border-slate-850 rounded-2xl flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-955/20 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Collected Revenue</p>
                          <p className="text-sm font-black text-emerald-600 mt-0.5">₹{billingStats.paid.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50/50 dark:bg-slate-955/20 border border-slate-150/40 dark:border-slate-850 rounded-2xl flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-rose-50 dark:bg-rose-955/20 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-4.5 w-4.5 text-rose-500" />
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Balance Owed</p>
                          <p className="text-sm font-black text-rose-600 mt-0.5">₹{billingStats.balance.toLocaleString()}</p>
                        </div>
                      </div>

                    </div>

                    {/* Invoices list */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Invoice History</h4>
                      
                      {linkedInvoices.length === 0 ? (
                        <p className="text-center py-8 text-xs text-slate-400 italic">No invoice records found for this client.</p>
                      ) : (
                        <div className="border border-slate-250 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                          <div className="overflow-x-auto w-full no-scrollbar">
                            <table className="w-full min-w-[500px] text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-955/20 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-500">
                                  <th className="p-3">Invoice Number</th>
                                  <th className="p-3">Issue Date</th>
                                  <th className="p-3">Due Date</th>
                                  <th className="p-3">Total Amount</th>
                                  <th className="p-3 text-center">Status</th>
                                  <th className="p-3 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {linkedInvoices.map(inv => (
                                  <tr
                                    key={inv.id}
                                    onClick={() => setPreviewingInvoice(inv)}
                                    className="border-b border-slate-100 dark:border-slate-850 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                                  >
                                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Invoice {inv.invoiceNumber}</td>
                                    <td className="p-3 text-slate-500">{new Date(inv.issueDate).toLocaleDateString()}</td>
                                    <td className="p-3 text-slate-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                                    <td className="p-3 font-bold">₹{inv.total.toLocaleString()}</td>
                                    <td className="p-3 text-center">
                                      <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                        inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                                        inv.status === 'overdue' ? 'bg-rose-50 text-rose-600' :
                                        'bg-amber-50 text-amber-600'
                                      }`}>{inv.status}</span>
                                    </td>
                                    <td className="p-3 text-right">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewingInvoice(inv);
                                        }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-[10px] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-bold transition-all cursor-pointer shadow-2xs"
                                      >
                                        <Eye className="h-3 w-3" /> View Invoice
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* 4. CLIENT FILES storage TAB */}
                {activeTab === 'files' && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Associated Storage Items</h4>
                    
                    {linkedFiles.length === 0 ? (
                      <p className="text-center py-12 text-slate-400 text-xs italic">
                        No file attachments linked to this client. Attachments are pulled from this client's connected project tasks.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {linkedFiles.map((file, idx) => (
                          <div key={idx} className="p-3 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150/40 dark:border-slate-805/40 rounded-2xl flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <FileText className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                              <div className="min-w-0">
                                <a href={file.url} target="_blank" rel="noopener noreferrer" className="font-bold truncate hover:underline hover:text-slate-900 dark:hover:text-white block pr-2" title={file.name}>
                                  {file.name}
                                </a>
                                <span className="text-[8px] text-slate-400 block mt-0.5">Task: {file.taskTitle}</span>
                              </div>
                            </div>
                            <a
                              href={file.url}
                              download={file.name}
                              className="p-1.5 hover:bg-slate-205 dark:hover:bg-slate-800 rounded-lg text-slate-450 hover:text-slate-800 transition-all shrink-0"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 5. CALENDAR EVENTS TAB */}
                {activeTab === 'events' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Deadlines & Meetings</h4>
                      <button
                        onClick={openAddMeeting}
                        className="text-[9px] font-black text-slate-900 dark:text-slate-100 hover:underline uppercase tracking-wider flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add Meeting
                      </button>
                    </div>
                    
                    {linkedEvents.length === 0 ? (
                      <p className="text-center py-12 text-slate-400 text-xs italic">
                        No calendar meetings or deadliness scheduled with this client.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {linkedEvents.map(ev => (
                          <div key={ev.id} className="p-3.5 bg-slate-50/50 dark:bg-slate-955/20 border border-slate-150/40 dark:border-slate-805/40 rounded-2xl flex items-center justify-between gap-3">
                            <div className="space-y-1">
                              <h5 className="text-xs font-bold text-slate-805 dark:text-slate-155">{ev.title}</h5>
                              <p className="text-[9px] text-slate-400 flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" /> {new Date(ev.startDateTime).toLocaleString()} — {new Date(ev.endDateTime).toLocaleTimeString()}
                              </p>
                              {ev.location && <p className="text-[9px] text-slate-400">Location: {ev.location}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {ev.type || 'Meeting'}
                              </span>
                              {!ev.id.startsWith('task-') && (
                                <button
                                  onClick={() => handleDeleteEvent(ev.id)}
                                  className="p-1 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-slate-400 hover:text-rose-500 rounded-lg transition-all"
                                  title="Cancel Meeting"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>
          )}
        </div>

      </div>

      {/* ADD CLIENT MODAL */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="relative w-full max-w-2xl max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-black text-slate-850 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Users2 className="h-4.5 w-4.5 text-slate-900 dark:text-slate-100" /> Add Client Profile
                </h3>
                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                  Enter client information, tax identifiers, and currency configuration
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleAddClient} className="flex-1 flex flex-col min-h-0">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* Profile Avatar / Icon Picker */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Profile Icon / Avatar</label>
                  {renderAvatarPickerControls(formAvatarUrl, (val) => setFormAvatarUrl(val || ''))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Company Name *</label>
                    <input required type="text" placeholder="e.g. Acme Corp" value={formCompanyName} onChange={e => setFormCompanyName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Contact Person *</label>
                    <input required type="text" placeholder="e.g. John Doe" value={formContactPerson} onChange={e => setFormContactPerson(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
                    <input type="email" placeholder="john@company.com" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Phone Number</label>
                    <input type="text" placeholder="+91 99999 99999" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Address Location</label>
                  <input type="text" placeholder="e.g. 102 Business Bay, Mumbai, India" value={formAddress} onChange={e => setFormAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">GST Number (GSTIN)</label>
                    <input type="text" placeholder="e.g. 27AAAAA1111A1Z1" value={formGstNumber} onChange={e => setFormGstNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Place of Supply (State)</label>
                    <select value={formPlaceOfSupply} onChange={e => setFormPlaceOfSupply(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="">Select State</option>
                      {INDIAN_STATES.map(s => (
                        <option key={s.code} value={`${s.name} (${s.code})`}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Website Domain</label>
                    <input type="text" placeholder="www.company.com" value={formWebsite} onChange={e => setFormWebsite(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Industry / Niche</label>
                    <input type="text" placeholder="e.g. SaaS / Information Technology" value={formIndustry} onChange={e => setFormIndustry(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Client Location</label>
                    <select value={formClientLocation} onChange={e => setFormClientLocation(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="domestic">Domestic (India)</option>
                      <option value="international">International</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Client Type</label>
                    <select value={formClientType} onChange={e => setFormClientType(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="business">Business</option>
                      <option value="individual">Individual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Default Payment Source</label>
                    <select value={formPaymentSource} onChange={e => setFormPaymentSource(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="indian_bank">Indian Bank Account</option>
                      <option value="foreign_remittance">Foreign Remittance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Invoice Currency</label>
                    <select value={formInvoiceCurrency} onChange={e => setFormInvoiceCurrency(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="AED">AED (د.إ)</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">GST Treatment Override</label>
                  <select value={formGstTreatmentOverride} onChange={e => setFormGstTreatmentOverride(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                    <option value="none">Auto-Calculate (Recommended)</option>
                    <option value="gst_applicable">GST Applicable (Force 18%)</option>
                    <option value="lut_export">LUT Export (Force 0% GST)</option>
                  </select>
                </div>

                {/* Dynamic Calculations Resolver Preview */}
                <div className="bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">Client Category</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{classifyClientCategory(formClientLocation, formClientType)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">GST Treatment</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formGstTreatmentOverride !== 'none'
                        ? (formGstTreatmentOverride === 'lut_export' ? 'LUT / Export of Services (No GST)' : 'GST Applicable')
                        : (determineGSTTreatment(formClientLocation, formPaymentSource).gstTreatment === 'lut_export' ? 'LUT / Export of Services (No GST)' : 'GST Applicable')
                      }
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">GST Percentage</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formGstTreatmentOverride !== 'none'
                        ? (formGstTreatmentOverride === 'lut_export' ? '0%' : '18%')
                        : (determineGSTTreatment(formClientLocation, formPaymentSource).gstRate + '%')
                      }
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">Invoice Type</span>
                    <span className="font-bold text-slate-900 dark:text-white">Tax Invoice</span>
                  </div>
                </div>

                <div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Status</label>
                    <div className="flex gap-2">
                      {(['active', 'inactive'] as const).map(st => (
                        <button key={st} type="button" onClick={() => setFormStatus(st)}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border capitalize transition-all cursor-pointer ${
                            formStatus === st ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-xs' : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}>
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Collections & Custom Tags */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5 mt-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-indigo-500" /> Collections & Tags
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowManageTagsModal(true)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                      >
                        + Manage Tags
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {customTags.map(tag => {
                        const isSelected = formTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setFormTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-xs font-bold'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                            }`}
                          >
                            <span>{isSelected ? '✓' : '+'}</span>
                            <span>{tag}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/40 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Press <kbd className="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded text-[10px] shadow-2xs">Esc</kbd> or click outside to dismiss
                </span>
                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    Create Profile
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CLIENT MODAL */}
      {showEditModal && activeClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowEditModal(false); }}
        >
          <div className="relative w-full max-w-2xl max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-black text-slate-850 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Edit2 className="h-4.5 w-4.5 text-slate-900 dark:text-slate-100" /> Edit Client Profile
                </h3>
                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                  Update business details, GST parameters, and active profile status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleEditClient} className="flex-1 flex flex-col min-h-0">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* Profile Avatar / Icon Picker */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Profile Icon / Avatar</label>
                  {renderAvatarPickerControls(formAvatarUrl, (val) => setFormAvatarUrl(val || ''))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Company Name *</label>
                    <input required type="text" placeholder="e.g. Acme Corp" value={formCompanyName} onChange={e => setFormCompanyName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Contact Person *</label>
                    <input required type="text" placeholder="e.g. John Doe" value={formContactPerson} onChange={e => setFormContactPerson(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
                    <input type="email" placeholder="john@company.com" value={formEmail} onChange={e => setFormEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Phone Number</label>
                    <input type="text" placeholder="+91 99999 99999" value={formPhone} onChange={e => setFormPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Address Location</label>
                  <input type="text" placeholder="e.g. 102 Business Bay, Mumbai, India" value={formAddress} onChange={e => setFormAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">GST Number (GSTIN)</label>
                    <input type="text" placeholder="e.g. 27AAAAA1111A1Z1" value={formGstNumber} onChange={e => setFormGstNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Place of Supply (State)</label>
                    <select value={formPlaceOfSupply} onChange={e => setFormPlaceOfSupply(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="">Select State</option>
                      {INDIAN_STATES.map(s => (
                        <option key={s.code} value={`${s.name} (${s.code})`}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Website Domain</label>
                    <input type="text" placeholder="www.company.com" value={formWebsite} onChange={e => setFormWebsite(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Industry / Niche</label>
                    <input type="text" placeholder="e.g. SaaS / Information Technology" value={formIndustry} onChange={e => setFormIndustry(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Client Location</label>
                    <select value={formClientLocation} onChange={e => setFormClientLocation(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="domestic">Domestic (India)</option>
                      <option value="international">International</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Client Type</label>
                    <select value={formClientType} onChange={e => setFormClientType(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="business">Business</option>
                      <option value="individual">Individual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Default Payment Source</label>
                    <select value={formPaymentSource} onChange={e => setFormPaymentSource(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="indian_bank">Indian Bank Account</option>
                      <option value="foreign_remittance">Foreign Remittance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Invoice Currency</label>
                    <select value={formInvoiceCurrency} onChange={e => setFormInvoiceCurrency(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="AED">AED (د.إ)</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">GST Treatment Override</label>
                  <select value={formGstTreatmentOverride} onChange={e => setFormGstTreatmentOverride(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer">
                    <option value="none">Auto-Calculate (Recommended)</option>
                    <option value="gst_applicable">GST Applicable (Force 18%)</option>
                    <option value="lut_export">LUT Export (Force 0% GST)</option>
                  </select>
                </div>

                {/* Dynamic Calculations Resolver Preview */}
                <div className="bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">Client Category</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{classifyClientCategory(formClientLocation, formClientType)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">GST Treatment</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formGstTreatmentOverride !== 'none'
                        ? (formGstTreatmentOverride === 'lut_export' ? 'LUT / Export of Services (No GST)' : 'GST Applicable')
                        : (determineGSTTreatment(formClientLocation, formPaymentSource).gstTreatment === 'lut_export' ? 'LUT / Export of Services (No GST)' : 'GST Applicable')
                      }
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">GST Percentage</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formGstTreatmentOverride !== 'none'
                        ? (formGstTreatmentOverride === 'lut_export' ? '0%' : '18%')
                        : (determineGSTTreatment(formClientLocation, formPaymentSource).gstRate + '%')
                      }
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 font-medium">Invoice Type</span>
                    <span className="font-bold text-slate-900 dark:text-white">Tax Invoice</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Status</label>
                  <div className="flex gap-2">
                    {(['active', 'inactive'] as const).map(st => (
                      <button key={st} type="button" onClick={() => setFormStatus(st)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border capitalize transition-all cursor-pointer ${
                          formStatus === st ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-xs' : 'border-slate-200 dark:border-slate-808 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}>
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Collections & Custom Tags */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-indigo-500" /> Collections & Tags
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowManageTagsModal(true)}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                    >
                      + Manage Tags
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {customTags.map(tag => {
                      const isSelected = formTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setFormTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-xs font-bold'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                          }`}
                        >
                          <span>{isSelected ? '✓' : '+'}</span>
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Danger Zone */}
                <div className="pt-4 mt-2 border-t border-rose-100 dark:border-rose-950/50">
                  <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-955/20 border border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Permanently delete this client profile and decouple associated dossiers.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteModal(true);
                        setDeleteConfirmName('');
                        setDeleteConsentChecked(false);
                      }}
                      className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete Client
                    </button>
                  </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 px-6 py-3.5 border-t border-slate-100 dark:border-slate-808 bg-slate-50/90 dark:bg-slate-950/40 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(true);
                    setDeleteConfirmName('');
                    setDeleteConsentChecked(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-955/30 rounded-xl transition-all cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Client
                </button>

                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOUBLE CONFIRMATION DELETE MODAL */}
      {showDeleteModal && activeClient && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget && !deletingClient) setShowDeleteModal(false); }}
        >
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3 bg-rose-50/50 dark:bg-rose-955/20">
              <div className="h-10 w-10 rounded-2xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  Delete Client Profile
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Double verification required before permanent deletion.
                </p>
              </div>
              <button
                type="button"
                disabled={deletingClient}
                onClick={() => setShowDeleteModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                You are about to permanently delete <span className="font-bold text-slate-900 dark:text-white">"{activeClient.companyName}"</span>. This action cannot be undone.
              </p>

              {/* Confirmation Step 1: Write Name */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  1. Type client name <span className="font-mono font-black text-rose-600 dark:text-rose-400 select-all">{activeClient.companyName}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  placeholder={`Type "${activeClient.companyName}"`}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-rose-500 dark:focus:border-rose-500 font-medium"
                />
              </div>

              {/* Confirmation Step 2: Explicit Consent */}
              <div className="space-y-2 pt-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  2. Explicit Consent:
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer select-none p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={deleteConsentChecked}
                    onChange={e => setDeleteConsentChecked(e.target.checked)}
                    disabled={deleteConfirmName.trim() !== activeClient.companyName.trim()}
                    className="mt-0.5 h-4 w-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                  />
                  <span className={`text-[11px] leading-tight ${
                    deleteConfirmName.trim() === activeClient.companyName.trim()
                      ? 'text-slate-700 dark:text-slate-300 font-medium'
                      : 'text-slate-400 dark:text-slate-600'
                  }`}>
                    I acknowledge and confirm the permanent deletion of this client profile.
                  </span>
                </label>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/30 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingClient}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  deleteConfirmName.trim() !== activeClient.companyName.trim() ||
                  !deleteConsentChecked ||
                  deletingClient
                }
                onClick={() => handleDeleteClient(activeClient.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  deleteConfirmName.trim() === activeClient.companyName.trim() && deleteConsentChecked && !deletingClient
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                {deletingClient ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" /> Confirm & Delete Client
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: MARK PROFILE AS SAFE / COMPLETE */}
      {showMarkSafeModal && activeClient && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget && !markingSafe) setShowMarkSafeModal(false); }}
        >
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3 bg-amber-50/50 dark:bg-amber-955/20">
              <div className="h-10 w-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  Mark Profile Safe to Leave
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Confirm dismissing incomplete details alert
                </p>
              </div>
              <button
                type="button"
                disabled={markingSafe}
                onClick={() => setShowMarkSafeModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to mark the client profile for <span className="font-bold text-slate-900 dark:text-white">"{activeClient.companyName}"</span> as safe to leave as-is?
              </p>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5">
                <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  What happens next:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400 pl-1">
                  <li>The "Client Profile Incomplete" alert will be permanently removed.</li>
                  <li>Any blank fields (such as address or tax classification) will remain safely empty until you choose to edit them.</li>
                  <li>You can always edit or update details later via the <span className="font-semibold text-slate-700 dark:text-slate-300">Edit</span> button.</li>
                </ul>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/30 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={markingSafe}
                onClick={() => setShowMarkSafeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={markingSafe}
                onClick={handleMarkProfileSafe}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {markingSafe ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" /> Confirm & Mark Safe
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MEETING MODAL */}
      {showAddMeetingModal && activeClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-955/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddMeetingModal(false); }}
        >
          <div className="relative w-full max-w-lg max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 dark:border-slate-808 flex justify-between items-center bg-white dark:bg-slate-900">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-black text-slate-850 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="h-4.5 w-4.5 text-slate-900 dark:text-slate-100" /> Link New Meeting
                </h3>
                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                  Schedule an engagement or review session for {activeClient.companyName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMeetingModal(false)}
                className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleAddMeeting} className="flex-1 flex flex-col min-h-0">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Meeting Title *</label>
                  <input required type="text" placeholder="e.g. Project Alignment / Sprint Demo" value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Date *</label>
                    <input required type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Start Time</label>
                    <input required type="time" value={meetingStartTime} onChange={e => setMeetingStartTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">End Time</label>
                    <input required type="time" value={meetingEndTime} onChange={e => setMeetingEndTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Location / Link</label>
                  <input type="text" placeholder="e.g. Google Meet or Zoom URL" value={meetingLocation} onChange={e => setMeetingLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors" />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Agenda / Notes</label>
                  <textarea rows={3} placeholder="Provide meeting agenda or goals..." value={meetingDescription} onChange={e => setMeetingDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-colors resize-none" />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 px-6 py-3.5 border-t border-slate-100 dark:border-slate-808 bg-slate-50/90 dark:bg-slate-950/40 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  Press <kbd className="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded text-[10px] shadow-2xs">Esc</kbd> to dismiss
                </span>
                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowAddMeetingModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingMeeting}
                    className="px-5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {creatingMeeting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Schedule & Link
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK AVATAR PICKER MODAL */}
      {showAvatarPickerModal && activeClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAvatarPickerModal(false); }}
        >
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Camera className="h-4.5 w-4.5 text-slate-900 dark:text-slate-100" /> Client Profile Icon
                </h3>
                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                  Choose a tag icon or upload a custom image logo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarPickerModal(false)}
                className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-6">
              {renderAvatarPickerControls(activeClient.avatarUrl, handleUpdateActiveClientAvatar, savingAvatar)}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/40 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowAvatarPickerModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE TAGS / COLLECTIONS MODAL */}
      {showManageTagsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowManageTagsModal(false); }}
        >
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Tag className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" /> Manage Collections & Tags
                </h3>
                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                  Organize clients into custom groups like Important, High Ticket, etc.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageTagsModal(false)}
                className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Create New Tag Form */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Create New Collection / Tag
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. VIP, Retainer, Enterprise..."
                  value={newTagNameInput}
                  onChange={e => setNewTagNameInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateNewTag(newTagNameInput);
                    }
                  }}
                  className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={() => handleCreateNewTag(newTagNameInput)}
                  disabled={!newTagNameInput.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Tag
                </button>
              </div>
            </div>

            {/* Existing Tags List */}
            <div className="p-6 space-y-2 max-h-72 overflow-y-auto no-scrollbar">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                Active Tags in Workspace ({customTags.length})
              </p>

              {customTags.map(tag => {
                const count = clients.filter(c => c.tags?.includes(tag)).length;
                const isEditing = editingTagName?.oldName === tag;

                return (
                  <div
                    key={tag}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editingTagName.newName}
                          onChange={e => setEditingTagName({ ...editingTagName, newName: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameTag(tag, editingTagName.newName);
                            if (e.key === 'Escape') setEditingTagName(null);
                          }}
                          className="flex-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-indigo-500 rounded-lg text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameTag(tag, editingTagName.newName)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTagName(null)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getTagBadgeClass(tag)}`}>
                          {tag}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {count} client{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTagFilter(tag);
                            setSortBasis('custom');
                            setShowManageTagsModal(false);
                          }}
                          className="px-2 py-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Filter client list by this tag"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTagName({ oldName: tag, newName: tag })}
                          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Rename tag"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-955/30 rounded-lg transition-colors cursor-pointer"
                          title="Delete tag"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/40 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                Changes persist automatically across clients.
              </span>
              <button
                type="button"
                onClick={() => setShowManageTagsModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLIENT SYNC SELECTION MODAL */}
      {showSyncSelectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Select Clients to Sync
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Choose which clients to push to Google Sheet&apos;s <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-emerald-600 font-mono">Clients</code> tab.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncSelectionModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Selection Toolbar & Filter */}
            <div className="px-6 py-3 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clients.length > 0 && selectedClientSyncIds.length === clients.length}
                    onChange={toggleSelectAllSyncClients}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-600"
                  />
                  <span>Select All ({clients.length})</span>
                </label>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                  {selectedClientSyncIds.length} selected
                </span>
              </div>

              {/* Search filter in modal */}
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter clients..."
                  value={syncSearchTerm}
                  onChange={e => setSyncSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Scrollable Client List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 max-h-[46vh]">
              {clients
                .filter(c => {
                  if (!syncSearchTerm.trim()) return true;
                  const term = syncSearchTerm.toLowerCase();
                  return (
                    c.companyName.toLowerCase().includes(term) ||
                    c.contactPerson.toLowerCase().includes(term) ||
                    c.email.toLowerCase().includes(term)
                  );
                })
                .map(cli => {
                  const isChecked = selectedClientSyncIds.includes(cli.id);
                  return (
                    <div
                      key={cli.id}
                      onClick={() => toggleClientSyncSelection(cli.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isChecked
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 shadow-2xs'
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleClientSyncSelection(cli.id)}
                          onClick={e => e.stopPropagation()}
                          className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-600 shrink-0"
                        />
                        <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                          {cli.companyName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {cli.companyName}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate flex items-center gap-2">
                            <span>{cli.contactPerson || 'No contact'}</span>
                            {cli.email && <span>• {cli.email}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {cli.clientLocation || 'domestic'}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                          cli.status === 'active'
                            ? 'bg-emerald-100/60 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {cli.status || 'active'}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Reconciliation / Selective Sync Notice */}
            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              {selectedClientSyncIds.length === clients.length && clients.length > 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60">
                  <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Full Mirror Sync:</strong> All active clients are selected. Unlisted or deleted clients in your Google Sheet (e.g. deleted accounts) will be automatically removed.
                  </span>
                </div>
              ) : selectedClientSyncIds.length > 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-xl border border-blue-200/60 dark:border-blue-800/60">
                  <Info className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Selective Sync:</strong> Only the {selectedClientSyncIds.length} selected client(s) will be updated or added. Other existing rows in your spreadsheet will not be removed.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-955/40 p-2.5 rounded-xl border border-rose-200/60 dark:border-rose-800/60">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Please select at least 1 client to sync to your spreadsheet.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowSyncSelectionModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSyncClients}
                disabled={selectedClientSyncIds.length === 0 || isSyncingClientsToSheet}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-emerald-600/20"
              >
                {isSyncingClientsToSheet ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span>
                  {isSyncingClientsToSheet
                    ? 'Syncing...'
                    : selectedClientSyncIds.length === clients.length
                    ? 'Confirm & Sync All Clients'
                    : `Confirm & Sync ${selectedClientSyncIds.length} Client${selectedClientSyncIds.length > 1 ? 's' : ''}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVOICE PREVIEW MODAL */}
      {previewingInvoice && (
        <InvoicePreviewModal
          invoice={{
            ...previewingInvoice,
            clientName: activeClient?.companyName || 'Client'
          }}
          onClose={() => setPreviewingInvoice(null)}
          clientName={activeClient?.companyName}
          businessProfile={businessProfile}
          onEdit={handleEditInvoice}
          onDelete={handleDeleteInvoice}
          onUpdateStatus={handleUpdateInvoiceStatus}
        />
      )}

    </div>
  );
}
