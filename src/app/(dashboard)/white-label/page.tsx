'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  Globe, ShieldCheck, Check, Copy, ExternalLink,
  CheckCircle2, AlertCircle, Plus, X, Users2,
  DollarSign, TrendingUp, Building2, BarChart3,
  Percent, ArrowUpRight, Search, Edit3, Trash2,
  ChevronDown, FileText, Handshake, Link2, Tag
} from 'lucide-react';

const STATUS_OPTIONS: { value: string; label: string; dotColor: string }[] = [
  { value: 'all', label: 'All Statuses', dotColor: 'bg-slate-400' },
  { value: 'active', label: 'Active', dotColor: 'bg-emerald-500' },
  { value: 'onboarding', label: 'Onboarding', dotColor: 'bg-blue-500' },
  { value: 'in_review', label: 'In Review', dotColor: 'bg-amber-500' },
  { value: 'paused', label: 'Paused', dotColor: 'bg-slate-400' },
];

const TAG_ICONS: Record<string, string> = {
  'Important Client': '⭐',
  'High Ticket': '💎',
  'Low Ticket': '🏷️',
  'all': '🏷️',
  'untagged': '⚪'
};

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
  return TAG_ICONS[tag] || '🏷️';
};


export interface PartnerHandoverClient {
  clientId: string;
  clientName: string;
  sharePercent: number; // e.g. 25 (%)
  projectPrice?: string; // e.g. "$2,500 / Project" or "$600/mo Retainer"
  scope?: string; // e.g. "Full branding & portal handover"
}

export interface WhiteLabelPartner {
  id: string;
  name: string;
  columnId: string;
  customDomain: string;
  color?: string;
  partnershipStatement?: string;
  handoverClients: PartnerHandoverClient[];
  status: 'active' | 'onboarding' | 'in_review' | 'paused';
  contactPerson: string;
  contactEmail: string;
  contractStartDate?: string;
  notes?: string;
  createdAt: string;

  // Legacy fields preserved for backward compatibility
  pricingModel?: string;
  docdrilSharePercent?: number;
  commissionNotes?: string;
  monthlyRevenue?: number;
  managedClientsCount?: number;
}

export interface CRMClientOption {
  id: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  tags?: string[];
  status?: string;
}

export interface WhiteLabelColumn {
  id: string;
  title: string;
  description?: string;
  badgeColor?: string;
  order: number;
}

const COLUMN_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; pill: string }> = {
  indigo: {
    bg: 'bg-indigo-50/50 dark:bg-indigo-950/20',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800/60',
    dot: 'bg-indigo-500',
    pill: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
  },
  emerald: {
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
  },
  purple: {
    bg: 'bg-purple-50/50 dark:bg-purple-950/20',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800/60',
    dot: 'bg-purple-500',
    pill: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800'
  },
  blue: {
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800/60',
    dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
  },
  amber: {
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800/60',
    dot: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
  },
  rose: {
    bg: 'bg-rose-50/50 dark:bg-rose-950/20',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800/60',
    dot: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
  }
};

function WhiteLabelSkeletonBoard() {
  return (
    <>
      {[
        { title: 'Agency', badgeColor: 'bg-indigo-500', count: 2 },
        { title: 'Partner', badgeColor: 'bg-purple-500', count: 2 },
        { title: 'B2B', badgeColor: 'bg-emerald-500', count: 1 }
      ].map((skeletonCol, colIdx) => (
        <div
          key={colIdx}
          className="w-[340px] shrink-0 bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex flex-col max-h-[calc(100vh-13rem)] overflow-hidden shadow-2xs animate-pulse"
        >
          {/* Column Header Skeleton */}
          <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`h-2.5 w-2.5 rounded-full ${skeletonCol.badgeColor} shrink-0 opacity-70`} />
              <div className="h-3.5 w-20 rounded-md skeleton-shimmer" />
              <div className="h-4 w-6 rounded-full skeleton-shimmer" />
            </div>
            <div className="flex items-center gap-1.5 opacity-50">
              <div className="h-6 w-6 rounded-lg skeleton-shimmer" />
              <div className="h-6 w-6 rounded-lg skeleton-shimmer" />
            </div>
          </div>

          {/* Subtitle Skeleton */}
          <div className="px-3.5 py-2 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-850">
            <div className="h-2.5 w-44 rounded skeleton-shimmer opacity-70" />
          </div>

          {/* Partner Cards Skeleton */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {Array.from({ length: skeletonCol.count }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg skeleton-shimmer shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-28 rounded skeleton-shimmer" />
                      <div className="h-2.5 w-16 rounded skeleton-shimmer opacity-60" />
                    </div>
                  </div>
                  <div className="h-5 w-14 rounded-full skeleton-shimmer" />
                </div>

                {/* Statement skeleton */}
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850 space-y-1.5">
                  <div className="h-2.5 w-full rounded skeleton-shimmer opacity-50" />
                  <div className="h-2.5 w-3/4 rounded skeleton-shimmer opacity-40" />
                </div>

                {/* Footer skeleton */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="h-3 w-20 rounded skeleton-shimmer opacity-60" />
                  <div className="h-3 w-14 rounded skeleton-shimmer opacity-60" />
                </div>
              </div>
            ))}
          </div>

          {/* Column Bottom Action Skeleton */}
          <div className="p-3 border-t border-slate-200/60 dark:border-slate-800/60 bg-white/40 dark:bg-slate-900/40">
            <div className="h-8 w-full rounded-xl skeleton-shimmer opacity-50" />
          </div>
        </div>
      ))}

      {/* End Card Skeleton */}
      <div className="w-[280px] shrink-0 border-2 border-dashed border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 flex flex-col items-center justify-center text-center opacity-60 min-h-[300px]">
        <div className="h-10 w-10 rounded-xl skeleton-shimmer mb-3" />
        <div className="h-3.5 w-28 rounded skeleton-shimmer mb-2" />
        <div className="h-2.5 w-36 rounded skeleton-shimmer opacity-50" />
      </div>
    </>
  );
}

export default function WhiteLabelPage() {
  const { activeWorkspace } = useWorkspace();

  // Data State
  const [columns, setColumns] = useState<WhiteLabelColumn[]>([]);
  const [partners, setPartners] = useState<WhiteLabelPartner[]>([]);
  const [availableClients, setAvailableClients] = useState<CRMClientOption[]>([]);
  const [customTags, setCustomTags] = useState<string[]>(['Important Client', 'High Ticket', 'Low Ticket']);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [openColumnDropdownPartnerId, setOpenColumnDropdownPartnerId] = useState<string | null>(null);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
        setOpenColumnDropdownPartnerId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add / Edit Partner Modal
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<WhiteLabelPartner | null>(null);
  const [partnerForm, setPartnerForm] = useState({
    name: '',
    columnId: 'agency',
    customDomain: '',
    partnershipStatement: '',
    handoverClients: [] as PartnerHandoverClient[],
    status: 'active' as WhiteLabelPartner['status'],
    contactPerson: '',
    contactEmail: '',
    notes: '',
    color: '#6366f1'
  });

  // Client selector helper state in modal
  const [selectedClientIdToAdd, setSelectedClientIdToAdd] = useState('');
  const [showAddCustomClient, setShowAddCustomClient] = useState(false);
  const [customClientName, setCustomClientName] = useState('');
  const [clientPickerSearch, setClientPickerSearch] = useState('');
  const [clientPickerTag, setClientPickerTag] = useState<string>('all');

  // Add / Edit Column Modal
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState<WhiteLabelColumn | null>(null);
  const [columnForm, setColumnForm] = useState({
    title: '',
    description: '',
    badgeColor: 'blue'
  });

  // Deletion Confirmation States
  const [partnerToDelete, setPartnerToDelete] = useState<WhiteLabelPartner | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<WhiteLabelColumn | null>(null);
  const [reassignTargetColId, setReassignTargetColId] = useState<string>('');

  // Load White-label, CRM Clients, and Tags from Core Backend
  useEffect(() => {
    if (!activeWorkspace) return;

    // Instantly hydrate from localStorage cache if available to prevent any empty flash
    try {
      const cached = localStorage.getItem(`whitelabel_cache_${activeWorkspace.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
          setColumns(parsed.columns);
          setPartners(parsed.partners || []);
          setLoading(false);
        }
      }
    } catch {}

    const fetchData = async () => {
      try {
        const [resWl, resClients, resTags] = await Promise.all([
          fetch(`/api/white-label?workspaceId=${activeWorkspace.id}`),
          fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`),
          fetch(`/api/crm/tags?workspaceId=${activeWorkspace.id}`)
        ]);

        if (resWl.ok) {
          const data = await resWl.json();
          if (data) {
            setColumns(data.columns || []);
            setPartners(data.partners || []);
            try {
              localStorage.setItem(`whitelabel_cache_${activeWorkspace.id}`, JSON.stringify({
                columns: data.columns || [],
                partners: data.partners || []
              }));
            } catch {}
          }
        }

        if (resClients.ok) {
          const clientsData = await resClients.json();
          if (Array.isArray(clientsData)) {
            setAvailableClients(clientsData);
          }
        }

        let loadedTags: string[] = [];
        try {
          const saved = localStorage.getItem(`client_custom_tags_${activeWorkspace.id}`) || localStorage.getItem(`crm_custom_tags_${activeWorkspace.id}`);
          if (saved) loadedTags = JSON.parse(saved);
        } catch {}

        if (resTags.ok) {
          const tagsData = await resTags.json();
          if (Array.isArray(tagsData.tags)) {
            loadedTags = Array.from(new Set([...loadedTags, ...tagsData.tags]));
          }
        }
        if (loadedTags.length > 0) {
          setCustomTags(loadedTags);
        }
      } catch (err) {
        console.error('Failed to load white-label configuration or clients', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Listen to real-time events from clients page or storage
    const handleTagsUpdated = (e: any) => {
      if (e?.detail?.tags && Array.isArray(e.detail.tags)) {
        setCustomTags(prev => Array.from(new Set([...prev, ...e.detail.tags])));
      }
    };
    const handleClientsUpdated = () => {
      fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (Array.isArray(data)) setAvailableClients(data);
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
      window.removeEventListener('crm_tags_updated', handleTagsUpdated);
      window.removeEventListener('crm_clients_updated', handleClientsUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, [activeWorkspace]);

  // Save to Core Backend
  const saveAll = async (
    updatedCols: WhiteLabelColumn[] = columns,
    updatedPartners: WhiteLabelPartner[] = partners
  ) => {
    if (!activeWorkspace) return;
    setSaving(true);
    try {
      const res = await fetch('/api/white-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          data: {
            columns: updatedCols,
            partners: updatedPartners
          }
        })
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        try {
          localStorage.setItem(`whitelabel_cache_${activeWorkspace.id}`, JSON.stringify({
            columns: updatedCols,
            partners: updatedPartners
          }));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to save white-label data', err);
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut (Escape to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPartnerModal(false);
        setShowColumnModal(false);
        setEditingPartner(null);
        setEditingColumn(null);
        setColumnToDelete(null);
        setPartnerToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered partners
  const filteredPartners = useMemo(() => {
    return partners.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        p.customDomain.toLowerCase().includes(q) ||
        (p.contactPerson && p.contactPerson.toLowerCase().includes(q)) ||
        (p.contactEmail && p.contactEmail.toLowerCase().includes(q)) ||
        (p.partnershipStatement && p.partnershipStatement.toLowerCase().includes(q)) ||
        (p.handoverClients && p.handoverClients.some(c =>
          c.clientName.toLowerCase().includes(q) ||
          (c.projectPrice && c.projectPrice.toLowerCase().includes(q)) ||
          (c.scope && c.scope.toLowerCase().includes(q))
        ));
      
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [partners, searchQuery, statusFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalCount = partners.length;
    const totalClients = partners.reduce(
      (sum, p) => sum + (p.handoverClients?.length || p.managedClientsCount || 0),
      0
    );

    let totalShares = 0;
    let clientSharesCount = 0;
    partners.forEach(p => {
      if (p.handoverClients && p.handoverClients.length > 0) {
        p.handoverClients.forEach(c => {
          totalShares += Number(c.sharePercent) || 0;
          clientSharesCount++;
        });
      } else if (p.docdrilSharePercent) {
        totalShares += p.docdrilSharePercent;
        clientSharesCount++;
      }
    });

    const avgShare = clientSharesCount > 0 ? (totalShares / clientSharesCount).toFixed(0) : '0';
    const activePortals = partners.filter(p => p.status === 'active').length;

    return { totalCount, totalClients, avgShare, activePortals };
  }, [partners]);

  // Tag collections & counts for White-label client picker
  const clientCollectionTags = useMemo(() => {
    const defaultTags = ['Important Client', 'High Ticket', 'Low Ticket'];
    const tagSet = new Set<string>([...defaultTags, ...customTags]);
    availableClients.forEach(c => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach(t => {
          if (t && t.trim()) tagSet.add(t.trim());
        });
      }
    });

    const counts: Record<string, number> = {
      all: availableClients.length,
      untagged: availableClients.filter(c => !c.tags || c.tags.length === 0).length
    };

    tagSet.forEach(tag => {
      counts[tag] = availableClients.filter(c => c.tags?.includes(tag)).length;
    });

    return { tagsList: Array.from(tagSet), counts };
  }, [availableClients]);

  // Filtered clients for interactive picker
  const filteredPickerClients = useMemo(() => {
    return availableClients.filter(c => {
      // Filter by tag
      if (clientPickerTag === 'untagged') {
        if (c.tags && c.tags.length > 0) return false;
      } else if (clientPickerTag !== 'all') {
        if (!c.tags || !c.tags.includes(clientPickerTag)) return false;
      }

      // Filter by search
      if (clientPickerSearch.trim()) {
        const q = clientPickerSearch.toLowerCase().trim();
        const matchName = c.companyName?.toLowerCase().includes(q);
        const matchContact = c.contactPerson?.toLowerCase().includes(q);
        const matchEmail = c.email?.toLowerCase().includes(q);
        const matchTag = c.tags?.some(t => t.toLowerCase().includes(q));
        return matchName || matchContact || matchEmail || matchTag;
      }

      return true;
    });
  }, [availableClients, clientPickerTag, clientPickerSearch]);

  const activeCategoryTitle = useMemo(() => {
    if (clientPickerTag === 'all') return 'All Clients';
    if (clientPickerTag === 'untagged') return 'Untagged';
    return clientPickerTag;
  }, [clientPickerTag]);

  // Handover Client handlers inside modal
  const handleAddHandoverClient = (client: PartnerHandoverClient) => {
    if (!client.clientId) return;
    setPartnerForm(prev => {
      if (prev.handoverClients.some(c => c.clientId === client.clientId)) {
        return prev;
      }
      return {
        ...prev,
        handoverClients: [...prev.handoverClients, client]
      };
    });
  };

  const handleUpdateHandoverClient = (
    index: number,
    field: keyof PartnerHandoverClient,
    val: any
  ) => {
    setPartnerForm(prev => {
      const updated = [...prev.handoverClients];
      updated[index] = { ...updated[index], [field]: val };
      return { ...prev, handoverClients: updated };
    });
  };

  const handleRemoveHandoverClient = (index: number) => {
    setPartnerForm(prev => ({
      ...prev,
      handoverClients: prev.handoverClients.filter((_, idx) => idx !== index)
    }));
  };

  // Open Partner Modal for Create
  const handleOpenCreatePartner = (colId?: string) => {
    setEditingPartner(null);
    setPartnerForm({
      name: '',
      columnId: colId || columns[0]?.id || 'agency',
      customDomain: '',
      partnershipStatement: '',
      handoverClients: [],
      status: 'active',
      contactPerson: '',
      contactEmail: '',
      notes: '',
      color: '#6366f1'
    });
    setSelectedClientIdToAdd('');
    setShowAddCustomClient(false);
    setCustomClientName('');
    setClientPickerSearch('');
    setClientPickerTag('all');
    setShowPartnerModal(true);
  };

  // Open Partner Modal for Edit
  const handleOpenEditPartner = (partner: WhiteLabelPartner) => {
    setEditingPartner(partner);
    setPartnerForm({
      name: partner.name,
      columnId: partner.columnId,
      customDomain: partner.customDomain,
      partnershipStatement: partner.partnershipStatement || partner.commissionNotes || partner.notes || '',
      handoverClients: Array.isArray(partner.handoverClients) ? [...partner.handoverClients] : [],
      status: partner.status,
      contactPerson: partner.contactPerson || '',
      contactEmail: partner.contactEmail || '',
      notes: partner.notes || '',
      color: partner.color || '#6366f1'
    });
    setSelectedClientIdToAdd('');
    setShowAddCustomClient(false);
    setCustomClientName('');
    setClientPickerSearch('');
    setClientPickerTag('all');
    setShowPartnerModal(true);
  };

  // Submit Partner
  const handleSubmitPartner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerForm.name.trim()) return;

    let updatedList: WhiteLabelPartner[];
    if (editingPartner) {
      updatedList = partners.map(p =>
        p.id === editingPartner.id
          ? {
              ...p,
              ...partnerForm,
              name: partnerForm.name.trim(),
              customDomain: partnerForm.customDomain.trim().toLowerCase(),
              contactPerson: partnerForm.contactPerson.trim(),
              contactEmail: partnerForm.contactEmail.trim().toLowerCase(),
              managedClientsCount: partnerForm.handoverClients.length
            }
          : p
      );
    } else {
      const newPartner: WhiteLabelPartner = {
        id: `p-${Date.now()}`,
        ...partnerForm,
        name: partnerForm.name.trim(),
        customDomain: partnerForm.customDomain.trim().toLowerCase(),
        contactPerson: partnerForm.contactPerson.trim(),
        contactEmail: partnerForm.contactEmail.trim().toLowerCase(),
        managedClientsCount: partnerForm.handoverClients.length,
        createdAt: new Date().toISOString()
      };
      updatedList = [...partners, newPartner];
    }

    setPartners(updatedList);
    saveAll(columns, updatedList);
    setShowPartnerModal(false);
  };

  // Delete Partner trigger
  const handleDeletePartner = (id: string, name: string) => {
    const partner = partners.find(p => p.id === id);
    if (partner) {
      setPartnerToDelete(partner);
    }
  };

  // Confirm Delete Partner
  const handleConfirmDeletePartner = () => {
    if (!partnerToDelete) return;
    const updated = partners.filter(p => p.id !== partnerToDelete.id);
    setPartners(updated);
    saveAll(columns, updated);
    setPartnerToDelete(null);
  };

  // Move Partner to another Column
  const handleMovePartner = (partnerId: string, targetColId: string) => {
    const updated = partners.map(p =>
      p.id === partnerId ? { ...p, columnId: targetColId } : p
    );
    setPartners(updated);
    saveAll(columns, updated);
  };

  // Open Column Modal for Create
  const handleOpenCreateColumn = () => {
    setEditingColumn(null);
    setColumnForm({
      title: '',
      description: '',
      badgeColor: 'blue'
    });
    setShowColumnModal(true);
  };

  // Open Column Modal for Edit
  const handleOpenEditColumn = (col: WhiteLabelColumn) => {
    setEditingColumn(col);
    setColumnForm({
      title: col.title,
      description: col.description || '',
      badgeColor: col.badgeColor || 'blue'
    });
    setShowColumnModal(true);
  };

  // Submit Column (Create or Update)
  const handleSubmitColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!columnForm.title.trim()) return;

    if (editingColumn) {
      const updatedCols = columns.map(c =>
        c.id === editingColumn.id
          ? {
              ...c,
              title: columnForm.title.trim(),
              description: columnForm.description.trim(),
              badgeColor: columnForm.badgeColor
            }
          : c
      );
      setColumns(updatedCols);
      saveAll(updatedCols, partners);
      setShowColumnModal(false);
      setEditingColumn(null);
    } else {
      const id = columnForm.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (columns.some(c => c.id === id)) {
        alert('A column with this name already exists.');
        return;
      }

      const newCol: WhiteLabelColumn = {
        id,
        title: columnForm.title.trim(),
        description: columnForm.description.trim() || `${columnForm.title.trim()} white-label accounts & partners`,
        badgeColor: columnForm.badgeColor,
        order: columns.length
      };

      const updated = [...columns, newCol];
      setColumns(updated);
      saveAll(updated, partners);
      setShowColumnModal(false);
    }
  };

  // Trigger Delete Column with confirmation modal
  const handleTriggerDeleteColumn = (col: WhiteLabelColumn) => {
    setColumnToDelete(col);
    const remaining = columns.filter(c => c.id !== col.id);
    setReassignTargetColId(remaining[0]?.id || '');
  };

  // Confirm Delete Column
  const handleConfirmDeleteColumn = () => {
    if (!columnToDelete) return;

    const remainingCols = columns.filter(c => c.id !== columnToDelete.id);
    const targetColId = reassignTargetColId || remainingCols[0]?.id || '';

    // Reassign partners to target column if any remain
    const updatedPartners = partners.map(p =>
      p.columnId === columnToDelete.id ? { ...p, columnId: targetColId } : p
    );

    setColumns(remainingCols);
    setPartners(updatedPartners);
    saveAll(remainingCols, updatedPartners);
    setColumnToDelete(null);
    setReassignTargetColId('');
  };

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="text-center max-w-sm bg-white dark:bg-slate-900 p-8 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
          <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">No Workspace Selected</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Select a workspace to view white-label partners and settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-7xl mx-auto min-h-screen flex flex-col text-slate-900 dark:text-slate-100 font-sans">
      
      {/* 1. Header with Compact Analytics Toggle & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 pb-3 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Globe className="h-5 w-5 text-gray-950 dark:text-gray-100 shrink-0" />
              <span>White-labeling</span>
            </h1>
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800 rounded-full flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Agency Reseller Hub
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Outsiders, agencies, and B2B enterprises operating under custom Docdril white-labeling.
          </p>
        </div>

        {/* Right Toolbar: Analytics Toggle + Add Column + Add Partner */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {saveSuccess && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in mr-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}

          {/* Toggleable Analytics Button */}
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-2xs ${
              showAnalytics
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
            title="View white-label reseller analytics breakdown"
          >
            <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
            <span>Analytics</span>
            <span className="px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400 font-bold">
              {metrics.totalCount}
            </span>
            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${showAnalytics ? 'rotate-180' : ''}`} />
          </button>

          {/* Add Industry Column Button */}
          <button
            onClick={handleOpenCreateColumn}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 text-indigo-500" />
            <span>Add Column</span>
          </button>

          {/* Add Partner Button */}
          <button
            onClick={() => handleOpenCreatePartner()}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Partner</span>
          </button>
        </div>
      </div>

      {/* 2. Collapsible Analytics Panel (Zero space when collapsed, reveals on demand) */}
      {showAnalytics && (
        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 shrink-0">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                White-Label Reseller Portfolio & Volume Overview
              </span>
            </div>
            <button
              onClick={() => setShowAnalytics(false)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg text-xs"
              title="Close Analytics"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-850">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">White-label Partners</div>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{metrics.totalCount} Outsiders</div>
              <div className="text-[10px] text-slate-400">Across {columns.length} segregated categories</div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-850">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Handover Clients</div>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{metrics.totalClients} Linked</div>
              <div className="text-[10px] text-slate-400">Handed over or requested on behalf</div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-850">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Portals</div>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{metrics.activePortals} Live</div>
              <div className="text-[10px] text-slate-400">Custom domains & white-label URLs</div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-850">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg. Partner Share</div>
              <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{metrics.avgShare}% Split</div>
              <div className="text-[10px] text-slate-400">Across client project terms</div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Search & Filter Bar (Compact & Sleek) */}
      <div className={`flex items-center gap-3 shrink-0 relative ${showStatusDropdown ? 'z-30' : 'z-10'}`}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter by partner, client, domain, scope, or terms..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Custom Status Filter Dropdown (prevents mobile disconnected native wheel) */}
        <div className="relative shrink-0" ref={statusDropdownRef}>
          <button
            type="button"
            onClick={() => setShowStatusDropdown(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-2 cursor-pointer shadow-2xs ${
              statusFilter !== 'all'
                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
            }`}
            title="Filter partners by status"
          >
            {statusFilter !== 'all' && (
              <span className={`h-2 w-2 rounded-full ${STATUS_OPTIONS.find(s => s.value === statusFilter)?.dotColor || 'bg-slate-400'}`} />
            )}
            <span>{STATUS_OPTIONS.find(s => s.value === statusFilter)?.label || 'All Statuses'}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showStatusDropdown && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-1 animate-in fade-in zoom-in-95 duration-100">
              {STATUS_OPTIONS.map(opt => {
                const isSelected = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setShowStatusDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${opt.dotColor}`} />
                      <span>{opt.label}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <span className="text-[11px] text-slate-400 ml-auto hidden sm:inline">
          {loading && columns.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              Loading partners &amp; portals...
            </span>
          ) : (
            <>Showing {filteredPartners.length} of {partners.length} partners</>
          )}
        </span>
      </div>

      {/* 4. 3+ INDUSTRY COLUMNS (Agency, Partner, B2B, + custom) - Elevated to the Top */}
      <div className="flex-1 min-h-[520px] overflow-x-auto pb-6 pt-1">
        <div className="flex gap-5 items-start min-w-max h-full">
          {loading && columns.length === 0 ? (
            <WhiteLabelSkeletonBoard />
          ) : (
            <>
              {columns.map(col => {
            const colTheme = COLUMN_COLORS[col.badgeColor || 'indigo'] || COLUMN_COLORS.indigo;
            const colPartners = filteredPartners.filter(p => p.columnId === col.id);

            return (
              <div
                key={col.id}
                className="w-[340px] shrink-0 bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl flex flex-col max-h-[calc(100vh-13rem)] overflow-hidden shadow-2xs"
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full ${colTheme.dot} shrink-0`} />
                    <h3 className="text-xs font-black tracking-tight uppercase truncate">{col.title}</h3>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {colPartners.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditColumn(col)}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all"
                      title={`Edit ${col.title} column`}
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleOpenCreatePartner(col.id)}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
                      title={`Add new partner to ${col.title}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleTriggerDeleteColumn(col)}
                      className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600 transition-all"
                      title={`Delete ${col.title} column`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Column Subtitle */}
                {col.description && (
                  <div className="px-3.5 py-1.5 bg-slate-50/50 dark:bg-slate-950/20 text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-850 truncate">
                    {col.description}
                  </div>
                )}

                {/* Column Cards List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {colPartners.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/40 dark:bg-slate-950/20">
                      <p className="text-xs font-semibold text-slate-400">No {col.title} listings yet</p>
                      <p className="text-[10px] text-slate-400 mt-1">Click + below to add the first white-label outsider.</p>
                    </div>
                  ) : (
                    colPartners.map(partner => (
                      <div
                        key={partner.id}
                        className={`bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 hover:shadow-md transition-all space-y-3 group relative ${openColumnDropdownPartnerId === partner.id ? 'z-20' : 'z-auto'}`}
                      >
                        {/* Card Top: Avatar, Name & Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs"
                              style={{ backgroundColor: partner.color || '#6366f1' }}
                            >
                              {partner.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-black truncate leading-tight">{partner.name}</h4>
                              <a
                                href={`https://${partner.customDomain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 mt-0.5 truncate"
                              >
                                <Globe className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{partner.customDomain}</span>
                                <ArrowUpRight className="h-2.5 w-2.5 shrink-0 opacity-70" />
                              </a>
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                            partner.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                              : partner.status === 'onboarding'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800'
                              : partner.status === 'in_review'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {partner.status.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Handover Clients & Custom Shares Box */}
                        <div className="bg-slate-50 dark:bg-slate-950/60 rounded-xl p-2.5 border border-slate-100 dark:border-slate-850 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                              <Users2 className="h-3 w-3 text-indigo-500" />
                              Handover Clients ({partner.handoverClients?.length || 0})
                            </span>
                            {partner.handoverClients && partner.handoverClients.length > 0 && (
                              <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                                Active Terms
                              </span>
                            )}
                          </div>

                          {partner.handoverClients && partner.handoverClients.length > 0 ? (
                            <div className="space-y-1.5">
                              {partner.handoverClients.map((client, idx) => (
                                <div
                                  key={client.clientId || idx}
                                  className="bg-white dark:bg-slate-900 rounded-lg p-2 border border-slate-200/70 dark:border-slate-800/80 shadow-2xs space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                                      {client.clientName}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-800/50">
                                        {client.sharePercent}% Share
                                      </span>
                                      {client.projectPrice && (
                                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                          {client.projectPrice}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {client.scope && (
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {client.scope}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic py-1">
                              No handover clients linked yet.
                            </div>
                          )}
                        </div>

                        {/* Partnership Statement / Agreement Notes */}
                        {partner.partnershipStatement ? (
                          <div className="p-2.5 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/40 text-[10px]">
                            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 mb-1">
                              <FileText className="h-3 w-3" />
                              Partnership Statement
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed italic line-clamp-3">
                              "{partner.partnershipStatement}"
                            </p>
                          </div>
                        ) : null}

                        <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2 relative">
                          <span className="truncate mr-2">
                            Contact: <strong className="text-slate-600 dark:text-slate-300 font-medium">{partner.contactPerson}</strong>
                          </span>
                          
                          {/* Action Buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleOpenEditPartner(partner)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                              title="Edit Partner Info"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                            
                            {/* Move column selector (custom dropdown to prevent detached mobile wheel) */}
                            <div className={`relative ${openColumnDropdownPartnerId === partner.id ? 'z-30' : ''}`} ref={openColumnDropdownPartnerId === partner.id ? columnDropdownRef : undefined}>
                              <button
                                type="button"
                                onClick={() => setOpenColumnDropdownPartnerId(prev => prev === partner.id ? null : partner.id)}
                                className="text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer transition-colors"
                                title="Move to another industry column"
                              >
                                <span className="truncate max-w-[70px]">{columns.find(c => c.id === partner.columnId)?.title || 'Column'}</span>
                                <ChevronDown className={`h-2.5 w-2.5 text-slate-400 transition-transform ${openColumnDropdownPartnerId === partner.id ? 'rotate-180' : ''}`} />
                              </button>

                              {openColumnDropdownPartnerId === partner.id && (
                                <div className="absolute right-0 bottom-full mb-1.5 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-1 animate-in fade-in zoom-in-95 duration-100 opacity-100 ring-1 ring-black/5 dark:ring-white/5">
                                  <div className="px-2 py-1 text-[8px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
                                    Move Column
                                  </div>
                                  {columns.map(c => {
                                    const isCurrent = c.id === partner.columnId;
                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => {
                                          handleMovePartner(partner.id, c.id);
                                          setOpenColumnDropdownPartnerId(null);
                                        }}
                                        className={`w-full text-left px-2 py-1 rounded text-[10px] font-medium flex items-center justify-between cursor-pointer transition-colors ${
                                          isCurrent
                                            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                      >
                                        <span className="truncate">{c.title}</span>
                                        {isCurrent && <Check className="h-3 w-3 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => handleDeletePartner(partner.id, partner.name)}
                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600"
                              title="Delete Partner"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Bottom Add Card in Column */}
                  <button
                    onClick={() => handleOpenCreatePartner(col.id)}
                    className="w-full py-2.5 px-3 border border-dashed border-slate-300 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-xl text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-900 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add to {col.title}
                  </button>
                </div>
              </div>
            );
          })}

          {/* End Card: Add New Industry Column */}
          <div
            onClick={handleOpenCreateColumn}
            className="w-[280px] shrink-0 border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 group min-h-[300px]"
          >
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-600 group-hover:text-white text-slate-500 flex items-center justify-center transition-all mb-3 shadow-2xs">
              <Plus className="h-5 w-5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              Add Industry Column
            </h4>
            <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-relaxed">
              Create new sections like Enterprise, Consulting, Affiliate, or Healthcare.
            </p>
          </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT PARTNER */}
      {showPartnerModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div>
                <h3 className="text-base font-black">
                  {editingPartner ? 'Edit White-Label Partner' : 'Add White-Label Partner'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Link handover clients, customize project shares, and define collaborative agreement terms.
                </p>
              </div>
              <button
                onClick={() => setShowPartnerModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPartner} className="space-y-4">
              {/* Partner Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Partner / Agency Name *</label>
                  <input
                    type="text"
                    required
                    value={partnerForm.name}
                    onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })}
                    placeholder="e.g. Apex Creative Agency"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Industry Column *</label>
                  <select
                    value={partnerForm.columnId}
                    onChange={e => setPartnerForm({ ...partnerForm, columnId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none"
                  >
                    {columns.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Custom Domain / Portal URL</label>
                  <input
                    type="text"
                    value={partnerForm.customDomain}
                    onChange={e => setPartnerForm({ ...partnerForm, customDomain: e.target.value })}
                    placeholder="e.g. portal.apexagency.io"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono font-medium focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Relationship Status</label>
                  <select
                    value={partnerForm.status}
                    onChange={e => setPartnerForm({ ...partnerForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="in_review">In Review</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              {/* Handover Clients & Custom Shares Section */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Users2 className="h-3.5 w-3.5 text-indigo-500" />
                      Clients Handover & Shares
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Choose from existing Docdril CRM clients to link to this partner, setting individual shares and deal values.
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                    {partnerForm.handoverClients.length} Attached
                  </span>
                </div>

                {/* Collections & Tags Interactive Client Picker */}
                <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3 shadow-2xs">
                  {/* Category label */}
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    COLLECTIONS & TAGS
                  </div>

                  {/* Tag Pills */}
                  <div className="flex flex-wrap gap-2">
                    {/* All Clients Pill */}
                    <button
                      type="button"
                      onClick={() => setClientPickerTag('all')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        clientPickerTag === 'all'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <Tag className={`h-3 w-3 ${clientPickerTag === 'all' ? 'text-white' : 'text-indigo-500'}`} />
                      <span>All Clients</span>
                      <span
                        className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                          clientPickerTag === 'all'
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {clientCollectionTags.counts.all || 0}
                      </span>
                    </button>

                    {/* Dynamic & Default Tags */}
                    {clientCollectionTags.tagsList.map(tag => {
                      const isSelected = clientPickerTag === tag;
                      const icon = getTagIcon(tag);
                      const count = clientCollectionTags.counts[tag] || 0;

                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setClientPickerTag(tag)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <span className="text-xs leading-none">{icon}</span>
                          <span>{tag}</span>
                          <span
                            className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}

                    {/* Untagged Pill */}
                    <button
                      type="button"
                      onClick={() => setClientPickerTag('untagged')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        clientPickerTag === 'untagged'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="text-xs leading-none">⚪</span>
                      <span>Untagged</span>
                      <span
                        className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                          clientPickerTag === 'untagged'
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {clientCollectionTags.counts.untagged || 0}
                      </span>
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search all clients..."
                      value={clientPickerSearch}
                      onChange={e => setClientPickerSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                    {clientPickerSearch && (
                      <button
                        type="button"
                        onClick={() => setClientPickerSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Active Tag Header Banner with Checkmark */}
                  <div className="bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 px-3.5 py-2 rounded-xl flex items-center justify-between text-xs font-bold border border-indigo-100 dark:border-indigo-900/40">
                    <span>
                      {activeCategoryTitle} ({filteredPickerClients.length})
                    </span>
                    <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  </div>

                  {/* Interactive Client List */}
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950">
                    {filteredPickerClients.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No clients found matching the selected tag and search criteria.
                      </div>
                    ) : (
                      filteredPickerClients.map(c => {
                        const isAttached = partnerForm.handoverClients.some(h => h.clientId === c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              if (isAttached) {
                                const idx = partnerForm.handoverClients.findIndex(h => h.clientId === c.id);
                                if (idx !== -1) handleRemoveHandoverClient(idx);
                              } else {
                                handleAddHandoverClient({
                                  clientId: c.id,
                                  clientName: c.companyName || 'Untitled Client',
                                  sharePercent: 25,
                                  projectPrice: '',
                                  scope: ''
                                });
                              }
                            }}
                            className={`group px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                              isAttached
                                ? 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-semibold text-xs ${
                                    isAttached
                                      ? 'text-indigo-700 dark:text-indigo-300'
                                      : 'text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  {c.companyName}
                                </span>
                                {c.contactPerson && (
                                  <span className="text-[11px] text-slate-400 truncate">
                                    · {c.contactPerson}
                                  </span>
                                )}
                              </div>
                              {c.tags && c.tags.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                  {c.tags.map(t => (
                                    <span
                                      key={t}
                                      className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded-md font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 border border-slate-200/60 dark:border-slate-700/60"
                                    >
                                      <span>{getTagIcon(t)}</span>
                                      <span>{t}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5">
                              {isAttached ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/80">
                                  <Check className="h-3 w-3" />
                                  Attached
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                  <Plus className="h-3 w-3" />
                                  Add
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Option to add custom/external client not yet in CRM */}
                <div>
                  {showAddCustomClient ? (
                    <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                      <input
                        type="text"
                        placeholder="External Client or Organization Name"
                        value={customClientName}
                        onChange={e => setCustomClientName(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={!customClientName.trim()}
                        onClick={() => {
                          handleAddHandoverClient({
                            clientId: `ext-${Date.now()}`,
                            clientName: customClientName.trim(),
                            sharePercent: 25,
                            projectPrice: '',
                            scope: ''
                          });
                          setCustomClientName('');
                          setShowAddCustomClient(false);
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 text-white rounded-xl text-xs font-bold disabled:opacity-40"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCustomClient(false);
                          setCustomClientName('');
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg text-xs"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddCustomClient(true)}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Or attach incoming client not yet in CRM
                    </button>
                  )}
                </div>

                {/* Attached Clients List */}
                {partnerForm.handoverClients.length > 0 ? (
                  <div className="space-y-2.5 pt-1">
                    {partnerForm.handoverClients.map((client, idx) => (
                      <div
                        key={client.clientId || idx}
                        className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">
                              {client.clientName}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveHandoverClient(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                            title="Remove client from partner"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">
                              Partner Share (%)
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={client.sharePercent}
                                onChange={e => handleUpdateHandoverClient(idx, 'sharePercent', Number(e.target.value))}
                                className="w-full pl-2.5 pr-6 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold focus:outline-none"
                                placeholder="25"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                                %
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">
                              Price / Deal Value
                            </label>
                            <input
                              type="text"
                              value={client.projectPrice || ''}
                              onChange={e => handleUpdateHandoverClient(idx, 'projectPrice', e.target.value)}
                              placeholder="e.g. $2,500 / project"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">
                              Project Scope / Notes
                            </label>
                            <input
                              type="text"
                              value={client.scope || ''}
                              onChange={e => handleUpdateHandoverClient(idx, 'scope', e.target.value)}
                              placeholder="e.g. Portal deployment & hosting"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
                    No clients attached yet. Select an existing client above to set up tailored revenue shares.
                  </div>
                )}
              </div>

              {/* Partnership Statement & Agreement Terms */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold uppercase text-slate-500">
                    Partnership Statement & Agreement Terms
                  </label>
                  <span className="text-[10px] text-slate-400 italic">
                    Explain collaboration rules & arrangement
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={partnerForm.partnershipStatement}
                  onChange={e => setPartnerForm({ ...partnerForm, partnershipStatement: e.target.value })}
                  placeholder="Explain how this partnership operates: e.g. Apex Agency refers B2B clients and retains 70% of billing while Docdril takes a 30% technical management share. Docdril provides custom domain hosting, secure dossiers, and live client support. Payouts are reconciled monthly."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={partnerForm.contactPerson}
                    onChange={e => setPartnerForm({ ...partnerForm, contactPerson: e.target.value })}
                    placeholder="e.g. Marcus Vance"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={partnerForm.contactEmail}
                    onChange={e => setPartnerForm({ ...partnerForm, contactEmail: e.target.value })}
                    placeholder="marcus@apexagency.io"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPartnerModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  {editingPartner ? 'Save Partner Updates' : 'Add Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT INDUSTRY COLUMN */}
      {showColumnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div>
                <h3 className="text-base font-black">
                  {editingColumn ? 'Edit Industry Column' : 'Add Industry Column'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingColumn
                    ? 'Update section title, description, and badge color.'
                    : 'Create a new section heading for grouping white-label accounts.'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowColumnModal(false);
                  setEditingColumn(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitColumn} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Column Title *</label>
                <input
                  type="text"
                  required
                  value={columnForm.title}
                  onChange={e => setColumnForm({ ...columnForm, title: e.target.value })}
                  placeholder="e.g. Enterprise, Healthcare, Affiliate, Consulting"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Subtitle / Description</label>
                <input
                  type="text"
                  value={columnForm.description}
                  onChange={e => setColumnForm({ ...columnForm, description: e.target.value })}
                  placeholder="e.g. Direct healthcare network client portals"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">Theme Color</label>
                <div className="flex items-center gap-2.5">
                  {Object.keys(COLUMN_COLORS).map(colorKey => (
                    <button
                      key={colorKey}
                      type="button"
                      onClick={() => setColumnForm({ ...columnForm, badgeColor: colorKey })}
                      className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
                        columnForm.badgeColor === colorKey ? 'ring-2 ring-slate-900 dark:ring-white scale-110' : 'hover:scale-105'
                      }`}
                    >
                      <span className={`h-5 w-5 rounded-full ${COLUMN_COLORS[colorKey].dot}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowColumnModal(false);
                    setEditingColumn(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  {editingColumn ? 'Save Column Updates' : 'Create Column'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE PARTNER CONFIRMATION */}
      {partnerToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Delete Partner?
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Confirm permanent removal of this white-label account.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-2 mb-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Partner Name</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{partnerToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Portal URL</span>
                <span className="font-mono text-slate-600 dark:text-slate-300 text-[11px]">{partnerToDelete.customDomain}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Handover Clients</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{partnerToDelete.handoverClients?.length || 0} Clients Linked</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">{partnerToDelete.name}</strong>? Its custom portal setup, client share agreements, and partnership terms will be permanently erased.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPartnerToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePartner}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all"
              >
                Confirm Delete Partner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE COLUMN CONFIRMATION */}
      {columnToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in fade-in duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Delete Column "{columnToDelete.title}"?
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Confirm removal of this industry column.
                </p>
              </div>
            </div>

            {(() => {
              const partnersInCol = partners.filter(p => p.columnId === columnToDelete.id);
              const otherCols = columns.filter(c => c.id !== columnToDelete.id);

              return (
                <div className="space-y-4">
                  {partnersInCol.length > 0 ? (
                    <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/30 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                          This column contains <strong>{partnersInCol.length} active partner{partnersInCol.length > 1 ? 's' : ''}</strong> ({partnersInCol.map(p => p.name).join(', ')}).
                        </p>
                      </div>

                      {otherCols.length > 0 ? (
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                            Move partners in this column to:
                          </label>
                          <select
                            value={reassignTargetColId || otherCols[0]?.id}
                            onChange={e => setReassignTargetColId(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold focus:outline-none"
                          >
                            {otherCols.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">
                          This is your only column. Deleting it will also remove its partners.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      This column currently has 0 partners. Are you sure you want to permanently delete it?
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setColumnToDelete(null);
                        setReassignTargetColId('');
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteColumn}
                      className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all"
                    >
                      Confirm Delete Column
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}
