'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useConfirm } from '@/context/ConfirmContext';
import {
  FileSpreadsheet, Plus, DollarSign, Clock, CheckCircle2, Check, Settings,
  FileText, ArrowUpRight, Loader2, X, AlertCircle, Trash2, Edit3, Eye, Download, Printer,
  Receipt, ReceiptText, ArrowDownLeft, Building2, Calendar, QrCode, Upload, Info,
  Tag, ChevronDown, ChevronRight, Search, CloudUpload, RefreshCw, ExternalLink, Copy, CheckCheck, Sparkles,
  ArrowUpDown, SlidersHorizontal, Lock
} from 'lucide-react';
import { determineGSTTreatment, classifyClientCategory, INDIAN_STATES } from '@/lib/services/gstEngine';
import { APPS_SCRIPT_TEMPLATE, SheetConfig } from '@/lib/services/sheetSyncTemplate';
import CustomDropdown from '@/components/CustomDropdown';

function InvoicesUrlListener({
  onParams
}: {
  onParams: (params: { newInvoice?: boolean; clientId?: string; docType?: string; editId?: string }) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const isNew = searchParams.get('new') === 'true' || searchParams.get('new') === '1';
    const clientId = searchParams.get('clientId') || undefined;
    const docType = searchParams.get('docType') || undefined;
    const editId = searchParams.get('edit') || undefined;
    if (isNew || clientId || docType || editId) {
      onParams({ newInvoice: isNew, clientId, docType, editId });
    }
  }, [searchParams, onParams]);
  return null;
}

function getTagIcon(tagName: string): string {
  const lower = tagName.toLowerCase();
  if (lower.includes('important')) return '⭐';
  if (lower.includes('high ticket')) return '💎';
  if (lower.includes('low ticket')) return '🏷️';
  if (lower.includes('untagged')) return '⚪';
  return '🔖';
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  previousInvoiceNumber?: string;
  previousInvoiceNumbers?: string[];
  clientId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  total: number;
  subtotal: number;
  taxTotal: number;
  discount: number;
  notes: string; // contains metadata JSON
  items?: InvoiceLineItem[];
  currency?: string;
  createdAt?: string;
}

interface Client {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  website?: string;
  industry?: string;
  notes?: string;
  createdAt?: string;
  clientLocation?: 'domestic' | 'international';
  clientType?: 'business' | 'individual';
  paymentSource?: 'foreign_remittance' | 'indian_bank';
  invoiceCurrency?: string;
  gstTreatmentOverride?: 'gst_applicable' | 'lut_export' | null;
  status?: string;
  gstNumber?: string;
  placeOfSupply?: string;
  tags?: string[];
}

interface ApiInvoice {
  id: string;
  invoiceNumber: string;
  previousInvoiceNumber?: string;
  previousInvoiceNumbers?: string[];
  clientId: string;
  clientName?: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  total: number;
  subtotal: number;
  taxTotal: number;
  discount: number;
  notes?: string;
  items?: InvoiceLineItem[];
  createdAt?: string;
}

const FROM = {
  name: 'Docdril',
  gstin: '10CKTPC0886R1ZL',
  addr: 'Ward No. 21, Station Road, Samastipur, 848101',
  phone: '+91 6203526454',
  email: 'info@docdril.com',
  web: 'docdril.com',
  bank: 'Bank Name: Kotak Mahindra\nIFSC: KKBK0008057\nA/c Number: 2645691612\nUPI ID: 7304631447@okbizaxis'
};

const STATUS_MAP = {
  draft:   { label: 'Draft',   textClass: 'text-slate-600 dark:text-slate-400',   bgClass: 'bg-slate-100 dark:bg-slate-800' },
  sent:    { label: 'Sent',    textClass: 'text-indigo-600 dark:text-indigo-400', bgClass: 'bg-indigo-50 dark:bg-indigo-950/20' },
  paid:    { label: 'Paid',    textClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-50 dark:bg-emerald-950/20' },
  overdue: { label: 'Overdue', textClass: 'text-rose-600 dark:text-rose-400',       bgClass: 'bg-rose-50 dark:bg-rose-955/20' },
  void:    { label: 'Void',    textClass: 'text-slate-400',                       bgClass: 'bg-slate-100 dark:bg-slate-850' }
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

type InvoiceSortOption =
  | 'number-desc'
  | 'number-asc'
  | 'date-desc'
  | 'date-asc'
  | 'amount-desc'
  | 'amount-asc';

const getTrailingInvoiceDigits = (str: string): number | null => {
  const match = String(str || '').match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : null;
};

const compareInvoicesByNumber = (a: Invoice, b: Invoice, order: 'desc' | 'asc' = 'desc'): number => {
  const numA = String(a.invoiceNumber || '').trim();
  const numB = String(b.invoiceNumber || '').trim();

  const valA = getTrailingInvoiceDigits(numA);
  const valB = getTrailingInvoiceDigits(numB);

  if (valA !== null && valB !== null && valA !== valB) {
    return order === 'desc' ? valB - valA : valA - valB;
  }

  const cmp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
  if (cmp !== 0) {
    return order === 'desc' ? -cmp : cmp;
  }

  const dateA = a.createdAt || a.issueDate || '';
  const dateB = b.createdAt || b.issueDate || '';
  return order === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
};

const compareInvoices = (a: Invoice, b: Invoice, sortBy: InvoiceSortOption): number => {
  switch (sortBy) {
    case 'number-desc':
      return compareInvoicesByNumber(a, b, 'desc');
    case 'number-asc':
      return compareInvoicesByNumber(a, b, 'asc');
    case 'date-desc': {
      const dateA = a.issueDate || a.dueDate || a.createdAt || '';
      const dateB = b.issueDate || b.dueDate || b.createdAt || '';
      const cmp = dateB.localeCompare(dateA);
      return cmp !== 0 ? cmp : compareInvoicesByNumber(a, b, 'desc');
    }
    case 'date-asc': {
      const dateA = a.issueDate || a.dueDate || a.createdAt || '';
      const dateB = b.issueDate || b.dueDate || b.createdAt || '';
      const cmp = dateA.localeCompare(dateB);
      return cmp !== 0 ? cmp : compareInvoicesByNumber(a, b, 'asc');
    }
    case 'amount-desc': {
      const diff = (b.total || 0) - (a.total || 0);
      return diff !== 0 ? diff : compareInvoicesByNumber(a, b, 'desc');
    }
    case 'amount-asc': {
      const diff = (a.total || 0) - (b.total || 0);
      return diff !== 0 ? diff : compareInvoicesByNumber(a, b, 'asc');
    }
    default:
      return compareInvoicesByNumber(a, b, 'desc');
  }
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const { activeWorkspace, currentMember, getTabAccess } = useWorkspace();
  const isReadOnly = getTabAccess('invoices') === 'view';
  const isWorkspaceOwner = user?.role === 'admin' || activeWorkspace?.ownerId === user?.id || currentMember?.role === 'owner';
  const confirm = useConfirm();

  const getCurrencySymbol = (cur: string) => {
    if (cur === 'USD') return '$';
    if (cur === 'EUR') return '€';
    if (cur === 'GBP') return '£';
    if (cur === 'AED') return 'AED ';
    return '₹';
  };
  
  // Data lists
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<'classic' | 'modern' | 'compact'>('classic');
  const [previewMobileTab, setPreviewMobileTab] = useState<'preview' | 'details'>('preview');
  const [copiedAi, setCopiedAi] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    if (selectedInvoice) {
      setPreviewMobileTab('preview');
    }
  }, [selectedInvoice?.id]);

  // Inactive clients cannot be billed
  const eligibleClients = useMemo(() => {
    return clients.filter((c) => c.status !== 'inactive');
  }, [clients]);

  // URL query params for navigation from clients page
  const [urlQuery, setUrlQuery] = useState<{
    newInvoice?: boolean;
    clientId?: string;
    docType?: string;
    editId?: string;
  } | null>(null);
  const handledQueryRef = useRef<string>('');

  // Generator form states
  const [docType, setDocType] = useState<'invoice' | 'proforma' | 'receipt'>('invoice');
  const [tpl, setTpl] = useState<'classic' | 'modern' | 'compact'>('classic');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  
  // Billed to autofilled
  const [clientName, setClientName] = useState('');
  const [clientGst, setClientGst] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  
  // Line items
  const [lineItems, setLineItems] = useState<{ id: number; desc: string; qty: number; rate: number }[]>([
    { id: 1, desc: '', qty: 1, rate: 0 }
  ]);
  const [nextItemId, setNextItemId] = useState(2);
  
  // Tax settings
  const [gstRate, setGstRate] = useState(18);
  const [gstType, setGstType] = useState<'igst' | 'cgst'>('igst');
  const [discountPct, setDiscountPct] = useState(0);
  const [advancePct, setAdvancePct] = useState(20);
  const [requireAdvance, setRequireAdvance] = useState(true);
  const [notesText, setNotesText] = useState('We appreciate the opportunity to work with you!');

  // Business Profile states
  const [businessProfile, setBusinessProfile] = useState({
    name: 'Docdril',
    gstin: '10CKTPC0886R1ZL',
    addr: 'Ward No. 21, Station Road, Samastipur, 848101',
    phone: '+91 6203526454',
    email: 'info@docdril.com',
    web: 'docdril.com',
    bank: 'Bank Name: Kotak Mahindra\nIFSC: KKBK0008057\nA/c Number: 2645691612\nUPI ID: 7304631447@okbizaxis',
    upiId: '7304631447@okbizaxis',
    lutNumber: '',
    qrCode: '',
    logo: '/logo.png',
    tagline: 'Creative-tech studio'
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [bizName, setBizName] = useState('Docdril');
  const [bizTagline, setBizTagline] = useState('Creative-tech studio');
  const [bizGstin, setBizGstin] = useState('10CKTPC0886R1ZL');
  const [bizAddr, setBizAddr] = useState('Ward No. 21, Station Road, Samastipur, 848101');
  const [bizPhone, setBizPhone] = useState('+91 6203526454');
  const [bizEmail, setBizEmail] = useState('info@docdril.com');
  const [bizWeb, setBizWeb] = useState('docdril.com');
  const [bizBank, setBizBank] = useState('Bank Name: Kotak Mahindra\nIFSC: KKBK0008057\nA/c Number: 2645691612\nUPI ID: 7304631447@okbizaxis');
  const [bizUpi, setBizUpi] = useState('7304631447@okbizaxis');
  const [bizLut, setBizLut] = useState('');
  const [bizQr, setBizQr] = useState('');
  const [bizLogo, setBizLogo] = useState('/logo.png');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  const syncFormWithProfile = useCallback((p: any) => {
    if (!p) return;
    setBizName(p.name || '');
    setBizTagline(p.tagline || 'Creative-tech studio');
    setBizGstin(p.gstin || '');
    setBizAddr(p.addr || '');
    setBizPhone(p.phone || '');
    setBizEmail(p.email || '');
    setBizWeb(p.web || '');
    setBizBank(p.bank || '');
    setBizUpi(p.upiId || '');
    setBizLut(p.lutNumber || '');
    setBizQr(p.qrCode || '');
    setBizLogo(p.logo || '/logo.png');
  }, []);

  const handleAutoGenerateQr = async () => {
    if (!bizUpi.trim()) {
      alert('Please enter your UPI ID first');
      return;
    }
    setIsGeneratingQr(true);
    try {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(bizUpi.trim())}&pn=${encodeURIComponent(bizName.trim() || 'Merchant')}&cu=INR`;
      const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=450x450&margin=12&data=${encodeURIComponent(upiUrl)}`);
      if (!res.ok) throw new Error('Failed to generate');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = ev => {
        setBizQr(ev.target?.result as string);
        setIsGeneratingQr(false);
      };
      reader.readAsDataURL(blob);
    } catch {
      setIsGeneratingQr(false);
      alert('Could not auto-generate QR. Please check your internet connection or upload your QR code image manually.');
    }
  };

  // Google Sheets Two-Way Sync states
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    workspaceId: '',
    sheetUrl: '',
    webhookUrl: '',
    syncedInvoiceIds: []
  });
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [sheetModalUrl, setSheetModalUrl] = useState('');
  const [sheetModalWebhook, setSheetModalWebhook] = useState('');
  const [isTestingSheet, setIsTestingSheet] = useState(false);
  const [sheetTestResult, setSheetTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncingAllInvoices, setIsSyncingAllInvoices] = useState(false);
  const [isSyncingAllClients, setIsSyncingAllClients] = useState(false);
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<string | null>(null);
  const [showSyncDropdown, setShowSyncDropdown] = useState(false);
  const [hasCopiedScript, setHasCopiedScript] = useState(false);
  const [sheetSyncFeedback, setSheetSyncFeedback] = useState<string | null>(null);
  const syncDropdownRef = useRef<HTMLDivElement>(null);

  // Invoice Multi-Select Sync Modal States
  const [showInvoiceSyncModal, setShowInvoiceSyncModal] = useState(false);
  const [selectedInvoiceSyncIds, setSelectedInvoiceSyncIds] = useState<string[]>([]);
  const [invoiceSyncSearch, setInvoiceSyncSearch] = useState('');

  // Client Multi-Select Sync Modal States (from Invoices page)
  const [showClientSyncModalFromInvoices, setShowClientSyncModalFromInvoices] = useState(false);
  const [selectedClientSyncIdsFromInvoices, setSelectedClientSyncIdsFromInvoices] = useState<string[]>([]);
  const [clientSyncSearchFromInvoices, setClientSyncSearchFromInvoices] = useState('');

  // Invoice GST compliance & client categorization states
  const [clientLocation, setClientLocation] = useState<'domestic' | 'international'>('domestic');
  const [clientType, setClientType] = useState<'business' | 'individual'>('business');
  const [paymentSource, setPaymentSource] = useState<'foreign_remittance' | 'indian_bank'>('indian_bank');
  const [invoiceCurrency, setInvoiceCurrency] = useState('INR');
  const [gstTreatmentOverride, setGstTreatmentOverride] = useState<'gst_applicable' | 'lut_export' | 'none'>('none');

  // Ledger Filter states
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'Domestic Business' | 'Domestic Individual' | 'International Business' | 'International Individual'>('all');
  const [filterGstTreatment, setFilterGstTreatment] = useState<'all' | 'gst_applicable' | 'lut_export'>('all');
  const [filterPaymentSource, setFilterPaymentSource] = useState<'all' | 'foreign_remittance' | 'indian_bank'>('all');
  const [sortInvoicesBy, setSortInvoicesBy] = useState<InvoiceSortOption>('number-desc');
  const [activeDocTypeTab, setActiveDocTypeTab] = useState<'invoice' | 'proforma' | 'receipt'>('invoice');

  // Monthly GST Filing Report States
  const [showGstReport, setShowGstReport] = useState<boolean>(false);
  const [copiedGstSummary, setCopiedGstSummary] = useState<boolean>(false);

  // Tag & Collection filter states
  const DEFAULT_CUSTOM_TAGS = ['Important Client', 'High Ticket', 'Low Ticket'];
  const [customTags, setCustomTags] = useState<string[]>(DEFAULT_CUSTOM_TAGS);
  const [showTagClientDropdown, setShowTagClientDropdown] = useState(false);
  const [tagClientSearch, setTagClientSearch] = useState('');
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({
    'Important Client': true,
    'High Ticket': true,
    'Low Ticket': true,
  });
  const [modalTagFilter, setModalTagFilter] = useState<string>('all');
  const [modalClientSearch, setModalClientSearch] = useState<string>('');
  const [showModalClientDropdown, setShowModalClientDropdown] = useState<boolean>(false);

  // Restore session cache once mounted in browser to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const cInvoices = sessionStorage.getItem('cached_invoices_list');
        if (cInvoices) {
          setInvoices(JSON.parse(cInvoices));
          setLoading(false);
        }
        const cClients = sessionStorage.getItem('cached_invoices_clients');
        if (cClients) setClients(JSON.parse(cClients));

        const sClient = sessionStorage.getItem('last_invoices_filter_client');
        if (sClient) setFilterClientId(sClient);
        const sMonth = sessionStorage.getItem('last_invoices_filter_month');
        if (sMonth) setFilterMonth(sMonth);
        const sCat = sessionStorage.getItem('last_invoices_filter_category');
        if (sCat) setFilterCategory(sCat as any);
        const sGst = sessionStorage.getItem('last_invoices_filter_gst');
        if (sGst) setFilterGstTreatment(sGst as any);
        const sSource = sessionStorage.getItem('last_invoices_filter_source');
        if (sSource) setFilterPaymentSource(sSource as any);
        const sSort = sessionStorage.getItem('last_invoices_sort');
        if (sSort) setSortInvoicesBy(sSort as any);
        const sDocTab = sessionStorage.getItem('last_invoices_doc_tab');
        if (sDocTab && (sDocTab === 'invoice' || sDocTab === 'proforma' || sDocTab === 'receipt')) {
          setActiveDocTypeTab(sDocTab);
        }
      } catch {}
    }
  }, []);

  // Persist filters (only after mounted)
  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('last_invoices_filter_client', filterClientId);
        sessionStorage.setItem('last_invoices_filter_month', filterMonth);
        sessionStorage.setItem('last_invoices_filter_category', filterCategory);
        sessionStorage.setItem('last_invoices_filter_gst', filterGstTreatment);
        sessionStorage.setItem('last_invoices_filter_source', filterPaymentSource);
        sessionStorage.setItem('last_invoices_sort', sortInvoicesBy);
        sessionStorage.setItem('last_invoices_doc_tab', activeDocTypeTab);
      } catch {}
    }
  }, [filterClientId, filterMonth, filterCategory, filterGstTreatment, filterPaymentSource, sortInvoicesBy, activeDocTypeTab, mounted]);

  useEffect(() => {
    if (!activeWorkspace) return;

    const defaultProfile = {
      name: 'Docdril',
      tagline: 'Creative-tech studio',
      gstin: '10CKTPC0886R1ZL',
      addr: 'Ward No. 21, Station Road, Samastipur, 848101',
      phone: '+91 6203526454',
      email: 'info@docdril.com',
      web: 'docdril.com',
      bank: 'Bank Name: Kotak Mahindra\nIFSC: KKBK0008057\nA/c Number: 2645691612\nUPI ID: 7304631447@okbizaxis',
      upiId: '7304631447@okbizaxis',
      lutNumber: '',
      qrCode: '',
      logo: '/logo.png'
    };

    // First load from localStorage for instant display
    const saved = localStorage.getItem(`business_profile_${activeWorkspace.id}`);
    let initialProfile = { ...defaultProfile };
    if (saved) {
      try {
        initialProfile = { ...initialProfile, ...JSON.parse(saved) };
      } catch {}
    }
    if (initialProfile.email && initialProfile.email.includes('@docdril.in')) {
      initialProfile.email = initialProfile.email.replace(/@docdril\.in$/i, '@docdril.com');
    }
    setBusinessProfile(initialProfile);
    syncFormWithProfile(initialProfile);

    // Fetch synced workspace profile from backend
    fetch(`/api/workspaces/business-profile?workspaceId=${activeWorkspace.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(serverProfile => {
        if (serverProfile) {
          let merged = { ...defaultProfile, ...serverProfile };
          if (merged.email && merged.email.includes('@docdril.in')) {
            merged.email = merged.email.replace(/@docdril\.in$/i, '@docdril.com');
          }
          // If server profile doesn't have qrCode, but local profile does, auto-sync local QR to server!
          if (!merged.qrCode && initialProfile.qrCode) {
            merged.qrCode = initialProfile.qrCode;
            fetch('/api/workspaces/business-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId: activeWorkspace.id, profile: merged })
            }).catch(() => {});
          }
          setBusinessProfile(merged);
          syncFormWithProfile(merged);
          localStorage.setItem(`business_profile_${activeWorkspace.id}`, JSON.stringify(merged));
        } else if (saved) {
          // Auto-sync initial local settings to server if server doesn't have it yet
          try {
            const localObj = JSON.parse(saved);
            fetch('/api/workspaces/business-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId: activeWorkspace.id, profile: localObj })
            }).catch(() => {});
          } catch {}
        }
      })
      .catch(() => {});

    // Fetch Google Sheets configuration
    fetch(`/api/crm/sheet-sync?workspaceId=${activeWorkspace.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.config) {
          setSheetConfig(data.config);
          setSheetModalUrl(data.config.sheetUrl || '');
          setSheetModalWebhook(data.config.webhookUrl || '');
        }
      })
      .catch(() => {});
  }, [activeWorkspace]);

  // Handle outside clicks for sync dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (syncDropdownRef.current && !syncDropdownRef.current.contains(e.target as Node)) {
        setShowSyncDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatInvoiceForSync = (inv: Invoice) => {
    let meta: any = {};
    if (inv.notes && inv.notes.startsWith('{')) {
      try { meta = JSON.parse(inv.notes); } catch {}
    }
    const invDocType = getDocTypeFromInvoice(inv);
    const docTypeLabel = invDocType === 'proforma' ? 'Proforma Invoice' : invDocType === 'receipt' ? 'Payment Receipt' : 'Tax Invoice';
    
    const prevNums: string[] = [];
    if (inv.previousInvoiceNumber) prevNums.push(inv.previousInvoiceNumber);
    if (meta.previousInvoiceNumber && !prevNums.includes(meta.previousInvoiceNumber)) prevNums.push(meta.previousInvoiceNumber);
    if (Array.isArray(inv.previousInvoiceNumbers)) {
      inv.previousInvoiceNumbers.forEach(p => { if (p && !prevNums.includes(p)) prevNums.push(p); });
    }
    if (Array.isArray(meta.previousInvoiceNumbers)) {
      meta.previousInvoiceNumbers.forEach((p: string) => { if (p && !prevNums.includes(p)) prevNums.push(p); });
    }

    // Resolve client from multiple fallback sources so it NEVER reverts to Unnamed Client
    const matchedClient = clients.find(c => c.id === inv.clientId);
    const resolvedClientName = 
      (inv.clientName && inv.clientName !== 'Unnamed Client' && inv.clientName !== 'Unknown Client') 
        ? inv.clientName 
        : (meta.clientName || matchedClient?.companyName || 'Unnamed Client');

    const resolvedClientGst = meta.clientGst || matchedClient?.gstNumber || '';
    const resolvedPlaceOfSupply = meta.placeOfSupply || matchedClient?.placeOfSupply || '';

    const resolvedPaymentSource = meta.paymentSource === 'foreign_remittance' 
      ? 'Foreign Remittance' 
      : meta.paymentSource === 'indian_bank' 
      ? 'Indian Bank' 
      : (matchedClient?.paymentSource === 'foreign_remittance' ? 'Foreign Remittance' : matchedClient?.paymentSource === 'indian_bank' ? 'Indian Bank' : (meta.paymentSource || matchedClient?.paymentSource || ''));

    const resolvedGstTreatment = meta.gstTreatment === 'lut_export' 
      ? 'LUT Export' 
      : meta.gstTreatment === 'gst_applicable' 
      ? 'GST Applicable' 
      : (matchedClient?.gstTreatmentOverride === 'lut_export' ? 'LUT Export' : matchedClient?.gstTreatmentOverride === 'gst_applicable' ? 'GST Applicable' : (meta.gstTreatment || 'Regular'));

    const currentNumUpper = (inv.invoiceNumber || '').trim().toUpperCase();
    const otherActiveNumbers = new Set(
      invoices
        .filter(i => i.id !== inv.id)
        .map(i => (i.invoiceNumber || '').trim().toUpperCase())
        .filter(Boolean)
    );
    const sanitizedPrevNums = prevNums.filter(p => {
      const upper = (p || '').trim().toUpperCase();
      return upper && upper !== currentNumUpper && !otherActiveNumbers.has(upper);
    });

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      previousInvoiceNumber: sanitizedPrevNums[0] || '',
      previousInvoiceNumbers: sanitizedPrevNums,
      docType: docTypeLabel,
      clientId: inv.clientId,
      clientName: resolvedClientName,
      clientGst: resolvedClientGst,
      placeOfSupply: resolvedPlaceOfSupply,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      status: inv.status,
      subtotal: inv.subtotal,
      taxTotal: inv.taxTotal,
      discount: inv.discount,
      total: inv.total,
      currency: inv.currency || 'INR',
      items: inv.items || [],
      gstTreatment: resolvedGstTreatment,
      paymentSource: resolvedPaymentSource,
      notes: meta.notesText || (inv.notes && !inv.notes.startsWith('{') ? inv.notes : ''),
    };
  };

  const formatClientForSync = (cli: Client) => {
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

  const handleSyncSingleInvoice = async (inv: Invoice) => {
    if (!sheetConfig.webhookUrl) {
      setSheetModalUrl(sheetConfig.sheetUrl || '');
      setSheetModalWebhook(sheetConfig.webhookUrl || '');
      setShowSheetModal(true);
      return;
    }
    setSyncingInvoiceId(inv.id);
    setSheetSyncFeedback(null);
    try {
      const res = await fetch('/api/crm/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id,
          action: 'sync_invoice',
          data: formatInvoiceForSync(inv),
        })
      });
      const data = await res.json();
      if (data.success) {
        setSheetConfig(prev => ({
          ...prev,
          syncedInvoiceIds: Array.from(new Set([...(prev.syncedInvoiceIds || []), inv.id]))
        }));
        setSheetSyncFeedback(`Synced ${inv.invoiceNumber} to Google Sheet!`);
        setTimeout(() => setSheetSyncFeedback(null), 4000);
      } else {
        alert(data.error || 'Failed to sync invoice with Google Sheet');
      }
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setSyncingInvoiceId(null);
    }
  };

  const openInvoiceSyncModal = () => {
    if (!sheetConfig.webhookUrl) {
      setSheetModalUrl(sheetConfig.sheetUrl || '');
      setSheetModalWebhook(sheetConfig.webhookUrl || '');
      setShowSheetModal(true);
      setShowSyncDropdown(false);
      return;
    }
    setSelectedInvoiceSyncIds(invoices.map(i => i.id));
    setInvoiceSyncSearch('');
    setShowInvoiceSyncModal(true);
    setShowSyncDropdown(false);
  };

  const toggleSelectAllSyncInvoices = () => {
    if (selectedInvoiceSyncIds.length === invoices.length) {
      setSelectedInvoiceSyncIds([]);
    } else {
      setSelectedInvoiceSyncIds(invoices.map(i => i.id));
    }
  };

  const toggleInvoiceSyncSelection = (id: string) => {
    setSelectedInvoiceSyncIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleConfirmSyncInvoices = async () => {
    if (selectedInvoiceSyncIds.length === 0) {
      alert('Please select at least one invoice to sync.');
      return;
    }
    const invoicesToSync = invoices
      .filter(inv => selectedInvoiceSyncIds.includes(inv.id))
      .sort((a, b) => {
        const numA = String(a.invoiceNumber || '').trim();
        const numB = String(b.invoiceNumber || '').trim();
        return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
      });
    const isFullSync = invoicesToSync.length === invoices.length;

    setIsSyncingAllInvoices(true);
    setSheetSyncFeedback(null);
    try {
      const formattedList = invoicesToSync.map(formatInvoiceForSync);
      const res = await fetch('/api/crm/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id,
          action: 'sync_all_invoices',
          data: formattedList,
          isFullSync,
          allActiveInvoiceNumbers: invoices.map(inv => inv.invoiceNumber),
          allActiveInvoiceIds: invoices.map(inv => inv.id),
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowInvoiceSyncModal(false);
        setSheetConfig(prev => ({
          ...prev,
          lastInvoiceSync: new Date().toISOString(),
          syncedInvoiceIds: Array.from(new Set([...(prev.syncedInvoiceIds || []), ...invoicesToSync.map(i => i.id)]))
        }));
        const deletedMsg = data.result?.deleted ? ` (reconciled & removed ${data.result.deleted} extra/deleted row${data.result.deleted > 1 ? 's' : ''})` : '';
        setSheetSyncFeedback(`Successfully synced ${invoicesToSync.length} invoice${invoicesToSync.length > 1 ? 's' : ''} to Google Sheet${deletedMsg}!`);
        setTimeout(() => setSheetSyncFeedback(null), 5000);
      } else {
        alert(data.error || 'Failed to sync invoices with Google Sheet');
      }
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setIsSyncingAllInvoices(false);
    }
  };

  const openClientSyncModalFromInvoices = () => {
    if (!sheetConfig.webhookUrl) {
      setSheetModalUrl(sheetConfig.sheetUrl || '');
      setSheetModalWebhook(sheetConfig.webhookUrl || '');
      setShowSheetModal(true);
      setShowSyncDropdown(false);
      return;
    }
    setSelectedClientSyncIdsFromInvoices(clients.map(c => c.id));
    setClientSyncSearchFromInvoices('');
    setShowClientSyncModalFromInvoices(true);
    setShowSyncDropdown(false);
  };

  const toggleSelectAllSyncClientsFromInvoices = () => {
    if (selectedClientSyncIdsFromInvoices.length === clients.length) {
      setSelectedClientSyncIdsFromInvoices([]);
    } else {
      setSelectedClientSyncIdsFromInvoices(clients.map(c => c.id));
    }
  };

  const toggleClientSyncSelectionFromInvoices = (id: string) => {
    setSelectedClientSyncIdsFromInvoices(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleConfirmSyncClientsFromInvoices = async () => {
    if (selectedClientSyncIdsFromInvoices.length === 0) {
      alert('Please select at least one client to sync.');
      return;
    }
    const clientsToSync = clients
      .filter(c => selectedClientSyncIdsFromInvoices.includes(c.id))
      .sort((a, b) => {
        const dateA = String(a.createdAt || '').trim();
        const dateB = String(b.createdAt || '').trim();
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return String(a.companyName || '').localeCompare(String(b.companyName || ''));
      });
    const isFullSync = clientsToSync.length === clients.length;

    setIsSyncingAllClients(true);
    setSheetSyncFeedback(null);
    try {
      const formattedList = clientsToSync.map(formatClientForSync);
      const res = await fetch('/api/crm/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id,
          action: 'sync_clients',
          data: formattedList,
          isFullSync,
          allActiveIds: clients.map(c => c.id),
          allActiveNames: clients.map(c => c.companyName),
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowClientSyncModalFromInvoices(false);
        setSheetConfig(prev => ({
          ...prev,
          lastClientSync: new Date().toISOString()
        }));
        const deletedMsg = data.result?.deleted ? ` (reconciled & removed ${data.result.deleted} extra/deleted row${data.result.deleted > 1 ? 's' : ''})` : '';
        setSheetSyncFeedback(`Successfully synced ${clientsToSync.length} client${clientsToSync.length > 1 ? 's' : ''} to Google Sheet${deletedMsg}!`);
        setTimeout(() => setSheetSyncFeedback(null), 5000);
      } else {
        alert(data.error || 'Failed to sync clients with Google Sheet');
      }
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setIsSyncingAllClients(false);
    }
  };

  const handleSaveSheetConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    if (!isWorkspaceOwner) {
      alert('Forbidden: Only the workspace owner is authorized to edit or modify Google Sheet integration settings.');
      return;
    }
    const cleanWebhook = sheetModalWebhook.trim().replace(/[\.,\s]+$/, '');
    const cleanSheetUrl = sheetModalUrl.trim();
    try {
      const res = await fetch('/api/crm/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id,
          action: 'save_config',
          sheetUrl: cleanSheetUrl,
          webhookUrl: cleanWebhook,
        })
      });
      const data = await res.json();
      if (data.success) {
        setSheetConfig(prev => ({
          ...prev,
          sheetUrl: cleanSheetUrl,
          webhookUrl: cleanWebhook,
        }));
        setSheetModalWebhook(cleanWebhook);
        setShowSheetModal(false);
        setSheetSyncFeedback('Google Sheet settings saved successfully!');
        setTimeout(() => setSheetSyncFeedback(null), 4000);
      } else {
        alert(data.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      alert(`Error saving configuration: ${err.message}`);
    }
  };

  const handleTestSheetConnection = async () => {
    const cleanWebhook = sheetModalWebhook.trim().replace(/[\.,\s]+$/, '');
    if (!cleanWebhook) {
      alert('Please enter your Google Apps Script Webhook URL first');
      return;
    }
    setSheetModalWebhook(cleanWebhook);
    setIsTestingSheet(true);
    setSheetTestResult(null);
    try {
      const res = await fetch('/api/crm/sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id,
          action: 'test_connection',
          webhookUrl: cleanWebhook,
        })
      });
      const data = await res.json();
      if (data.success) {
        setSheetTestResult({
          success: true,
          message: data.result?.message || 'Connected successfully to Google Sheet!'
        });
      } else {
        setSheetTestResult({
          success: false,
          message: data.error || 'Connection test failed. Please verify the Webhook URL and permissions.'
        });
      }
    } catch (err: any) {
      setSheetTestResult({
        success: false,
        message: `Connection failed: ${err.message}`
      });
    } finally {
      setIsTestingSheet(false);
    }
  };

  const handleCopyAppsScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    setHasCopiedScript(true);
    setTimeout(() => setHasCopiedScript(false), 3000);
  };

  const openSettings = () => {
    syncFormWithProfile(businessProfile);
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    const updated = {
      name: bizName,
      tagline: bizTagline,
      gstin: bizGstin,
      addr: bizAddr,
      phone: bizPhone,
      email: bizEmail,
      web: bizWeb,
      bank: bizBank,
      upiId: bizUpi,
      lutNumber: bizLut,
      qrCode: bizQr,
      logo: bizLogo || '/logo.png'
    };
    setBusinessProfile(updated);
    syncFormWithProfile(updated);
    localStorage.setItem(`business_profile_${activeWorkspace.id}`, JSON.stringify(updated));
    setShowSettingsModal(false);

    // Sync to server so all members have the same business profile and QR code
    try {
      await fetch('/api/workspaces/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          profile: updated
        })
      });
    } catch (err) {
      console.error('Failed to sync business profile to server:', err);
    }
  };
  
  const [creating, setCreating] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const fetchInvoices = async () => {
    if (!activeWorkspace) return;
    const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem('cached_invoices_list');
    if (!hasCache) setLoading(true);
    try {
      const [invoicesRes, clientsRes] = await Promise.all([
        fetch(`/api/crm/invoices?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`),
      ]);
      const clientRows: Client[] = clientsRes.ok ? await clientsRes.json() : [];
      setClients(clientRows);
      try { sessionStorage.setItem('cached_invoices_clients', JSON.stringify(clientRows)); } catch {}
      
      if (invoicesRes.ok) {
        const invoiceRows: ApiInvoice[] = await invoicesRes.json();
        const clientById = new Map(clientRows.map(c => [c.id, c]));
        
        const mappedInvoices = invoiceRows.map(invoice => {
          const client = clientById.get(invoice.clientId);
          let meta: any = {};
          try {
            if (invoice.notes && invoice.notes.startsWith('{')) meta = JSON.parse(invoice.notes);
          } catch {}
          const resolvedName = client ? client.companyName : (invoice.clientName || meta.clientName || 'Unknown Client');
          return {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            previousInvoiceNumber: (invoice as any).previousInvoiceNumber || meta.previousInvoiceNumber,
            previousInvoiceNumbers: (invoice as any).previousInvoiceNumbers || meta.previousInvoiceNumbers,
            clientId: invoice.clientId,
            clientName: resolvedName,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            status: invoice.status,
            total: invoice.total,
            subtotal: invoice.subtotal || invoice.total,
            taxTotal: invoice.taxTotal || 0,
            discount: invoice.discount || 0,
            notes: invoice.notes || '',
            items: invoice.items || []
          };
        });
        setInvoices(mappedInvoices);
        try { sessionStorage.setItem('cached_invoices_list', JSON.stringify(mappedInvoices)); } catch {}
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [activeWorkspace]);

  // Load custom tags for active workspace
  useEffect(() => {
    if (!activeWorkspace || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`client_custom_tags_${activeWorkspace.id}`);
      const loadedTags: string[] = saved ? JSON.parse(saved) : DEFAULT_CUSTOM_TAGS;
      const clientTags = clients.flatMap(c => c.tags || []);
      const merged = Array.from(new Set([...loadedTags, ...clientTags])).filter(Boolean);
      setCustomTags(merged.length > 0 ? merged : DEFAULT_CUSTOM_TAGS);
    } catch {
      setCustomTags(DEFAULT_CUSTOM_TAGS);
    }
  }, [activeWorkspace?.id, clients]);

  // Outside click listener for tag & client dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (showTagClientDropdown && !(e.target as HTMLElement)?.closest('.tag-client-dropdown-container')) {
        setShowTagClientDropdown(false);
      }
      if (showModalClientDropdown && !(e.target as HTMLElement)?.closest('.modal-client-dropdown-container')) {
        setShowModalClientDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('touchstart', handleOutsideClick);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showTagClientDropdown, showModalClientDropdown]);

  // Handle Escape key to exit all open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setEditingInvoice(null);
        setSelectedInvoice(null);
        setShowSettingsModal(false);
        setShowTagClientDropdown(false);
        setShowModalClientDropdown(false);
        setShowGstReport(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Autofill client fields when selection changes
  const handleClientSelect = (id: string) => {
    setClientId(id);
    const client = clients.find(c => c.id === id);
    if (client) {
      setClientName(client.companyName);
      setClientPhone(client.phone || '');
      setClientEmail(client.email || '');
      setClientAddress(client.address || '');
      setClientGst(client.gstNumber || '');
      setPlaceOfSupply(client.placeOfSupply || '');
      // Autofill client classifications
      setClientLocation(client.clientLocation || 'domestic');
      setClientType(client.clientType || 'business');
      setPaymentSource(client.paymentSource || 'indian_bank');
      setInvoiceCurrency(client.invoiceCurrency || 'INR');
      setGstTreatmentOverride(client.gstTreatmentOverride || 'none');

      // Smart auto-resolve for GST type (IGST vs CGST/SGST)
      if (client.gstNumber && businessProfile.gstin) {
        const bizPrefix = businessProfile.gstin.trim().slice(0, 2);
        const clientPrefix = client.gstNumber.trim().slice(0, 2);
        if (bizPrefix && clientPrefix && bizPrefix === clientPrefix) {
          setGstType('cgst');
        } else {
          setGstType('igst');
        }
      }
    } else {
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientAddress('');
      setClientGst('');
      setPlaceOfSupply('');
      setClientLocation('domestic');
      setClientType('business');
      setPaymentSource('indian_bank');
      setInvoiceCurrency('INR');
      setGstTreatmentOverride('none');
    }
  };

  // Helper to generate next document number based on type and existing records
  // Tax Invoice: DOC-YY-1030 (counts up from 1030)
  // Proforma Invoice: PRO-YY-1020 (counts up from 1020)
  // Receipt: REC-YY-1125 (counts up from 1125)
  const getNextDocNumber = (
    type: 'invoice' | 'proforma' | 'receipt',
    currentInvoices: Invoice[],
    yearStr?: string
  ) => {
    const yy = yearStr || new Date().getFullYear().toString().slice(-2);
    const prefix = type === 'invoice' ? 'DOC' : type === 'proforma' ? 'PRO' : 'REC';
    const minStart = type === 'invoice' ? 1030 : type === 'proforma' ? 1020 : 1125;

    const pattern = new RegExp(`^${prefix}-${yy}-(\\d+)`, 'i');
    let maxSeq = 0;

    currentInvoices.forEach(inv => {
      const num = (inv.invoiceNumber || '').trim();
      const match = num.match(pattern);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > maxSeq) {
          maxSeq = parsed;
        }
      }
    });

    const nextNum = maxSeq >= minStart ? maxSeq + 1 : minStart;
    return `${prefix}-${yy}-${nextNum}`;
  };

  // Helper to reliably detect document type from invoiceNumber or saved metadata
  const getDocTypeFromInvoice = (inv: Invoice): 'invoice' | 'proforma' | 'receipt' => {
    const num = (inv.invoiceNumber || '').trim().toUpperCase();
    if (num.startsWith('PRO-') || num.startsWith('PROFORMA')) return 'proforma';
    if (num.startsWith('REC-') || num.startsWith('RECEIPT')) return 'receipt';
    if (num.startsWith('DOC-')) return 'invoice';
    let m: any = {};
    try {
      if (inv.notes && inv.notes.startsWith('{')) m = JSON.parse(inv.notes);
    } catch {}
    if (m.docType === 'proforma' || m.docType === 'receipt') return m.docType;
    return 'invoice';
  };

  // Autogenerate doc numbers
  const openLogInvoice = (
    presetType: 'invoice' | 'proforma' | 'receipt' = 'invoice',
    presetClientId?: string,
    availableClients?: Client[]
  ) => {
    const today = new Date().toISOString().split('T')[0];
    const yy = today.split('-')[0].slice(-2);
    setDocType(presetType);
    const num = getNextDocNumber(presetType, invoices, yy);
    setInvoiceNumber(num);
    setIssueDate(today);
    const future = new Date();
    future.setDate(future.getDate() + 30);
    setDueDate(future.toISOString().split('T')[0]);

    const clientList = availableClients || clients;
    if (presetClientId) {
      const client = clientList.find(c => c.id === presetClientId);
      if (client && client.status !== 'inactive') {
        setClientId(presetClientId);
        setClientName(client.companyName);
        setClientPhone(client.phone || '');
        setClientEmail(client.email || '');
        setClientAddress(client.address || '');
        setClientGst(client.gstNumber || '');
        setPlaceOfSupply(client.placeOfSupply || '');
        setClientLocation(client.clientLocation || 'domestic');
        setClientType(client.clientType || 'business');
        setPaymentSource(client.paymentSource || 'indian_bank');
        setInvoiceCurrency(client.invoiceCurrency || 'INR');
        setGstTreatmentOverride(client.gstTreatmentOverride || 'none');

        if (client.gstNumber && businessProfile.gstin) {
          const bizPrefix = businessProfile.gstin.trim().slice(0, 2);
          const clientPrefix = client.gstNumber.trim().slice(0, 2);
          if (bizPrefix && clientPrefix && bizPrefix === clientPrefix) {
            setGstType('cgst');
          } else {
            setGstType('igst');
          }
        }
      } else {
        setClientName('');
        setClientPhone('');
        setClientEmail('');
        setClientAddress('');
        setClientGst('');
        setPlaceOfSupply('');
        setClientLocation('domestic');
        setClientType('business');
        setPaymentSource('indian_bank');
        setInvoiceCurrency('INR');
        setGstTreatmentOverride('none');
      }
    } else {
      setClientId('');
      setPlaceOfSupply('');
      setClientName('');
      setClientGst('');
      setClientPhone('');
      setClientEmail('');
      setClientAddress('');
      setClientLocation('domestic');
      setClientType('business');
      setPaymentSource('indian_bank');
      setInvoiceCurrency('INR');
      setGstTreatmentOverride('none');
    }

    setLineItems([{ id: 1, desc: '', qty: 1, rate: 0 }]);
    setGstRate(18);
    setGstType('igst');
    setDiscountPct(0);
    setAdvancePct(20);
    setRequireAdvance(true);
    setNotesText('We appreciate the opportunity to work with you!');
    setEditingInvoice(null);
    setShowAddModal(true);
  };

  // Open the form pre-populated for editing an existing invoice
  const openEditInvoice = (inv: Invoice) => {
    // Parse saved metadata
    let meta: Record<string, any> = {
      template: 'classic',
      docType: 'invoice',
      placeOfSupply: '',
      gstRate: 18,
      gstType: 'igst',
      advancePct: 20,
      requireAdvance: true,
      notesText: 'We appreciate the opportunity to work with you!',
      clientGst: '',
      clientPhone: '',
      clientEmail: '',
      clientAddress: '',
      clientName: inv.clientName,
      gstTreatment: 'gst_applicable',
      invoiceCurrency: 'INR',
      clientLocation: 'domestic',
      clientType: 'business',
      paymentSource: 'indian_bank',
    };
    try {
      if (inv.notes && inv.notes.startsWith('{')) {
        meta = { ...meta, ...JSON.parse(inv.notes) };
      }
    } catch {}

    // Hydrate all form states with full fallbacks from matchedClient
    const matchedClient = clients.find(c => c.id === inv.clientId);
    setInvoiceNumber(inv.invoiceNumber);
    setIssueDate(inv.issueDate);
    setDueDate(inv.dueDate);
    setClientId(inv.clientId);
    setClientName(meta.clientName || inv.clientName || matchedClient?.companyName || '');
    setClientGst(meta.clientGst || matchedClient?.gstNumber || '');
    setClientPhone(meta.clientPhone || matchedClient?.phone || '');
    setClientEmail(meta.clientEmail || matchedClient?.email || '');
    setClientAddress(meta.clientAddress || matchedClient?.address || '');
    setPlaceOfSupply(meta.placeOfSupply || matchedClient?.placeOfSupply || '');
    setDocType(getDocTypeFromInvoice(inv));
    setTpl((['classic', 'modern', 'compact'].includes(meta.template) ? meta.template : 'classic') as any);
    setGstRate(Number(meta.gstRate) || 18);
    setGstType(meta.gstType === 'cgst' ? 'cgst' : 'igst');
    setDiscountPct(inv.discount && inv.subtotal ? Math.round((inv.discount / inv.subtotal) * 100) : 0);
    setAdvancePct(Number(meta.advancePct) || 20);
    setRequireAdvance(meta.requireAdvance !== false);
    setNotesText(meta.notesText || '');
    setClientLocation(meta.clientLocation === 'international' ? 'international' : (matchedClient?.clientLocation === 'international' ? 'international' : 'domestic'));
    setClientType(meta.clientType === 'individual' ? 'individual' : (matchedClient?.clientType === 'individual' ? 'individual' : 'business'));
    setPaymentSource(meta.paymentSource === 'foreign_remittance' ? 'foreign_remittance' : (matchedClient?.paymentSource === 'foreign_remittance' ? 'foreign_remittance' : 'indian_bank'));
    setInvoiceCurrency(meta.invoiceCurrency || matchedClient?.invoiceCurrency || 'INR');
    setGstTreatmentOverride((['gst_applicable', 'lut_export'].includes(meta.gstTreatmentOverride) ? meta.gstTreatmentOverride : (matchedClient?.gstTreatmentOverride || 'none')) as any);

    // Hydrate line items from saved items array
    if (Array.isArray(inv.items) && inv.items.length > 0) {
      setLineItems(inv.items.map((item, i) => ({
        id: i + 1,
        desc: item.description || '',
        qty: item.quantity || 1,
        rate: item.unitPrice || 0
      })));
      setNextItemId(inv.items.length + 1);
    } else {
      setLineItems([{ id: 1, desc: '', qty: 1, rate: inv.total || 0 }]);
      setNextItemId(2);
    }

    setEditingInvoice(inv);
    setShowAddModal(true);
  };

  // Handle URL query trigger (e.g. from Clients page "+ GENERATE INVOICE" or Edit button)
  useEffect(() => {
    if (!urlQuery || loading) return;
    const queryKey = `${urlQuery.newInvoice}_${urlQuery.clientId}_${urlQuery.docType}_${urlQuery.editId}`;
    if (handledQueryRef.current === queryKey) return;

    if (urlQuery.editId) {
      if (invoices.length === 0) return;
      const target = invoices.find(i => i.id === urlQuery.editId);
      if (target) {
        handledQueryRef.current = queryKey;
        openEditInvoice(target);
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/invoices');
        }
      }
      return;
    }

    if (urlQuery.newInvoice || urlQuery.clientId) {
      if (urlQuery.clientId && clients.length === 0) return;
      handledQueryRef.current = queryKey;
      const presetType = (urlQuery.docType === 'proforma' || urlQuery.docType === 'receipt') ? urlQuery.docType : 'invoice';
      openLogInvoice(presetType, urlQuery.clientId, clients);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/invoices');
      }
    }
  }, [urlQuery, loading, clients, invoices]);

  // Line items actions
  const addLineItem = () => {
    setLineItems([...lineItems, { id: nextItemId, desc: '', qty: 1, rate: 0 }]);
    setNextItemId(nextItemId + 1);
  };

  const removeLineItem = (id: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const updateLineItem = (id: number, fields: Partial<{ desc: string; qty: number; rate: number }>) => {
    setLineItems(lineItems.map(item => item.id === id ? { ...item, ...fields } : item));
  };

  // Live Math calculations
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + (item.qty * item.rate), 0);
    const discount = subtotal * (discountPct / 100);
    const taxable = subtotal - discount;

    // Resolve GST treatment
    const resolvedGst = gstTreatmentOverride !== 'none'
      ? gstTreatmentOverride
      : determineGSTTreatment(clientLocation, paymentSource).gstTreatment;
      
    // Resolve GST percentage
    const activeGstRate = resolvedGst === 'lut_export' ? 0 : gstRate;

    const taxTotal = taxable * (activeGstRate / 100);
    const total = taxable + taxTotal;
    const advance = total * (advancePct / 100);

    return { subtotal, discount, taxable, taxTotal, total, advance, resolvedGst, activeGstRate };
  }, [lineItems, discountPct, gstRate, advancePct, clientLocation, paymentSource, gstTreatmentOverride]);

  const docTypeCounts = useMemo(() => {
    let tax = 0;
    let proforma = 0;
    let receipt = 0;

    invoices.forEach(inv => {
      let meta = {
        gstTreatment: 'gst_applicable',
        paymentSource: 'indian_bank',
        clientLocation: 'domestic',
        clientType: 'business'
      };
      try {
        if (inv.notes && inv.notes.startsWith('{')) {
          meta = { ...meta, ...JSON.parse(inv.notes) };
        }
      } catch {}

      if (filterClientId !== 'all') {
        if (inv.clientId !== filterClientId) return;
      } else if (filterTag !== 'all') {
        const client = clients.find(c => c.id === inv.clientId);
        if (filterTag === 'Untagged') {
          if (client?.tags && client.tags.length > 0) return;
        } else {
          if (!client?.tags?.includes(filterTag)) return;
        }
      }

      if (filterMonth !== 'all') {
        const dStr = inv.issueDate || inv.dueDate || '';
        const parts = dStr.split('-');
        const monthNum = parseInt(parts[1] || '0', 10);
        if (String(monthNum - 1) !== filterMonth) return;
      }

      if (filterCategory !== 'all') {
        const resolvedCategory = classifyClientCategory(
          (meta.clientLocation || 'domestic') as 'domestic' | 'international',
          (meta.clientType || 'business') as 'individual' | 'business'
        );
        if (resolvedCategory !== filterCategory) return;
      }

      if (filterGstTreatment !== 'all') {
        if (meta.gstTreatment !== filterGstTreatment) return;
      }

      if (filterPaymentSource !== 'all') {
        if (meta.paymentSource !== filterPaymentSource) return;
      }

      const dt = getDocTypeFromInvoice(inv);
      if (dt === 'proforma') proforma++;
      else if (dt === 'receipt') receipt++;
      else tax++;
    });

    return { tax, proforma, receipt };
  }, [invoices, filterClientId, filterTag, filterMonth, filterCategory, filterGstTreatment, filterPaymentSource, clients]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      let meta = {
        gstTreatment: 'gst_applicable',
        paymentSource: 'indian_bank',
        clientLocation: 'domestic',
        clientType: 'business'
      };
      try {
        if (inv.notes && inv.notes.startsWith('{')) {
          meta = { ...meta, ...JSON.parse(inv.notes) };
        }
      } catch {}

      // 0. Filter Client & Tag
      if (filterClientId !== 'all') {
        if (inv.clientId !== filterClientId) return false;
      } else if (filterTag !== 'all') {
        const client = clients.find(c => c.id === inv.clientId);
        if (filterTag === 'Untagged') {
          if (client?.tags && client.tags.length > 0) return false;
        } else {
          if (!client?.tags?.includes(filterTag)) return false;
        }
      }

      // 0b. Filter Month
      if (filterMonth !== 'all') {
        const dStr = inv.issueDate || inv.dueDate || '';
        const parts = dStr.split('-');
        const monthNum = parseInt(parts[1] || '0', 10);
        if (String(monthNum - 1) !== filterMonth) return false;
      }

      // 1. Filter Category
      if (filterCategory !== 'all') {
        const resolvedCategory = classifyClientCategory(
          (meta.clientLocation || 'domestic') as 'domestic' | 'international',
          (meta.clientType || 'business') as 'individual' | 'business'
        );
        if (resolvedCategory !== filterCategory) return false;
      }

      // 2. Filter GST Treatment
      if (filterGstTreatment !== 'all') {
        if (meta.gstTreatment !== filterGstTreatment) return false;
      }

      // 3. Filter Payment Source
      if (filterPaymentSource !== 'all') {
        if (meta.paymentSource !== filterPaymentSource) return false;
      }

      // 4. Filter Document Type Tab ('invoice' | 'proforma' | 'receipt')
      const invDocType = getDocTypeFromInvoice(inv);
      if (invDocType !== activeDocTypeTab) return false;

      return true;
    }).sort((a, b) => compareInvoices(a, b, sortInvoicesBy));
  }, [invoices, filterClientId, filterTag, filterMonth, filterCategory, filterGstTreatment, filterPaymentSource, sortInvoicesBy, activeDocTypeTab, clients]);

  // Group clients by tags for hierarchical selection
  const allTagsWithClients = useMemo(() => {
    const list: { tag: string; clients: Client[] }[] = [];
    
    // For each custom tag
    customTags.forEach(tag => {
      const tagged = clients.filter(c => c.tags?.includes(tag));
      list.push({ tag, clients: tagged });
    });

    // Untagged clients
    const untagged = clients.filter(c => !c.tags || c.tags.length === 0);
    if (untagged.length > 0) {
      list.push({ tag: 'Untagged', clients: untagged });
    }

    return list;
  }, [customTags, clients]);

  // Current clients belonging to active filterTag
  const currentTagClients = useMemo(() => {
    if (filterTag === 'all') return clients;
    if (filterTag === 'Untagged') {
      return clients.filter(c => !c.tags || c.tags.length === 0);
    }
    return clients.filter(c => c.tags?.includes(filterTag));
  }, [filterTag, clients]);

  // Clients filtered by search query inside active tag
  const displayClients = useMemo(() => {
    if (!tagClientSearch.trim()) return currentTagClients;
    const q = tagClientSearch.toLowerCase();
    return currentTagClients.filter(c =>
      c.companyName.toLowerCase().includes(q)
    );
  }, [currentTagClients, tagClientSearch]);

  // Group eligible clients for invoice generator selector
  const modalTagsWithClients = useMemo(() => {
    const list: { tag: string; clients: Client[] }[] = [];
    customTags.forEach(tag => {
      const tagged = eligibleClients.filter(c => c.tags?.includes(tag));
      list.push({ tag, clients: tagged });
    });
    const untagged = eligibleClients.filter(c => !c.tags || c.tags.length === 0);
    if (untagged.length > 0) {
      list.push({ tag: 'Untagged', clients: untagged });
    }
    return list;
  }, [customTags, eligibleClients]);

  const currentModalTagClients = useMemo(() => {
    if (modalTagFilter === 'all') return eligibleClients;
    if (modalTagFilter === 'Untagged') {
      return eligibleClients.filter(c => !c.tags || c.tags.length === 0);
    }
    return eligibleClients.filter(c => c.tags?.includes(modalTagFilter));
  }, [modalTagFilter, eligibleClients]);

  const displayModalClients = useMemo(() => {
    if (!modalClientSearch.trim()) return currentModalTagClients;
    const q = modalClientSearch.toLowerCase();
    return currentModalTagClients.filter(c =>
      c.companyName.toLowerCase().includes(q)
    );
  }, [currentModalTagClients, modalClientSearch]);

  const groupedInvoices = useMemo(() => {
    const groups: { monthKey: string; monthName: string; year: string; invoices: Invoice[]; total: number }[] = [];
    const map = new Map<string, { monthKey: string; monthName: string; year: string; invoices: Invoice[]; total: number }>();

    filteredInvoices.forEach(inv => {
      const dStr = inv.issueDate || inv.dueDate || '';
      const parts = dStr.split('-');
      const year = parts[0] || '';
      const monthNum = parseInt(parts[1] || '0', 10);
      const monthName = monthNum >= 1 && monthNum <= 12 ? MONTH_NAMES[monthNum - 1] : 'Other';
      const groupKey = `${year}-${parts[1] || '00'}`;

      if (!map.has(groupKey)) {
        const g = {
          monthKey: groupKey,
          monthName,
          year,
          invoices: [],
          total: 0
        };
        map.set(groupKey, g);
        groups.push(g);
      }
      const g = map.get(groupKey)!;
      g.invoices.push(inv);
      g.total += inv.total;
    });

    // Ensure invoices within each group are strictly sorted by sortInvoicesBy
    groups.forEach(g => {
      g.invoices.sort((a, b) => compareInvoices(a, b, sortInvoicesBy));
    });

    // Sort month groups
    groups.sort((a, b) => {
      if (sortInvoicesBy === 'number-desc' || sortInvoicesBy === 'date-desc') {
        return b.monthKey.localeCompare(a.monthKey);
      } else if (sortInvoicesBy === 'number-asc' || sortInvoicesBy === 'date-asc') {
        return a.monthKey.localeCompare(b.monthKey);
      }
      return b.monthKey.localeCompare(a.monthKey);
    });

    return groups;
  }, [filteredInvoices, sortInvoicesBy]);

  // Submit invoice (create or update)
  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !clientId || !invoiceNumber || !issueDate || !dueDate) {
      alert('Please fill out all required fields');
      return;
    }
    let previousInvoiceNumber = '';
    let previousInvoiceNumbers: string[] = [];

    if (editingInvoice) {
      try {
        if (editingInvoice.notes && editingInvoice.notes.startsWith('{')) {
          const oldMeta = JSON.parse(editingInvoice.notes);
          if (Array.isArray(oldMeta.previousInvoiceNumbers)) {
            previousInvoiceNumbers = [...oldMeta.previousInvoiceNumbers];
          }
          if (oldMeta.previousInvoiceNumber && !previousInvoiceNumbers.includes(oldMeta.previousInvoiceNumber)) {
            previousInvoiceNumbers.unshift(oldMeta.previousInvoiceNumber);
          }
        }
      } catch {}

      if (editingInvoice.previousInvoiceNumber && !previousInvoiceNumbers.includes(editingInvoice.previousInvoiceNumber)) {
        previousInvoiceNumbers.unshift(editingInvoice.previousInvoiceNumber);
      }
      if (Array.isArray(editingInvoice.previousInvoiceNumbers)) {
        editingInvoice.previousInvoiceNumbers.forEach(p => {
          if (p && !previousInvoiceNumbers.includes(p)) previousInvoiceNumbers.push(p);
        });
      }

      if (editingInvoice.invoiceNumber && editingInvoice.invoiceNumber !== invoiceNumber) {
        previousInvoiceNumber = editingInvoice.invoiceNumber;
        if (!previousInvoiceNumbers.includes(editingInvoice.invoiceNumber)) {
          previousInvoiceNumbers.unshift(editingInvoice.invoiceNumber);
        }
      } else if (previousInvoiceNumbers.length > 0) {
        previousInvoiceNumber = previousInvoiceNumbers[0];
      }

      // Filter out current invoice number and any other active invoice numbers from previousInvoiceNumbers
      const currentNumUpper = (invoiceNumber || '').trim().toUpperCase();
      const otherActiveNumbers = new Set(
        invoices
          .filter(inv => inv.id !== editingInvoice.id)
          .map(inv => (inv.invoiceNumber || '').trim().toUpperCase())
          .filter(Boolean)
      );
      previousInvoiceNumbers = previousInvoiceNumbers.filter(p => {
        const upper = (p || '').trim().toUpperCase();
        return upper && upper !== currentNumUpper && !otherActiveNumbers.has(upper);
      });
      if (previousInvoiceNumber && (previousInvoiceNumber.trim().toUpperCase() === currentNumUpper || otherActiveNumbers.has(previousInvoiceNumber.trim().toUpperCase()))) {
        previousInvoiceNumber = previousInvoiceNumbers[0] || '';
      }
    }

    // Format metadata JSON
    const metadata = {
      template: tpl,
      docType,
      placeOfSupply,
      gstRate: totals.activeGstRate,
      gstType,
      advancePct: requireAdvance ? advancePct : 0,
      requireAdvance,
      notesText,
      clientGst,
      clientPhone,
      clientEmail,
      clientAddress,
      clientName,
      gstTreatment: totals.resolvedGst,
      invoiceCurrency: invoiceCurrency,
      clientLocation,
      clientType,
      paymentSource,
      previousInvoiceNumber,
      previousInvoiceNumbers
    };

    const resolvedItems = lineItems.map(item => ({
      description: item.desc || 'Service description',
      quantity: item.qty,
      unitPrice: item.rate,
      taxRate: totals.activeGstRate
    }));

    try {
      if (editingInvoice) {
        // UPDATE existing invoice via PATCH
        const res = await fetch('/api/crm/invoices', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingInvoice.id,
            workspaceId: activeWorkspace.id,
            clientId,
            invoiceNumber,
            previousInvoiceNumber,
            previousInvoiceNumbers,
            issueDate,
            dueDate,
            items: resolvedItems,
            discount: totals.discount,
            currency: invoiceCurrency,
            notes: JSON.stringify(metadata),
            total: totals.total
          })
        });
        if (res.ok) {
          const editedId = editingInvoice.id;
          setShowAddModal(false);
          setEditingInvoice(null);
          // Immediately mark invoice as NOT synced so users get alert to sync it with Google Sheet
          setSheetConfig(prev => ({
            ...prev,
            syncedInvoiceIds: (prev.syncedInvoiceIds || []).filter(id => id !== editedId)
          }));
          const activeTabForDoc = docType === 'proforma' ? 'proforma' : docType === 'receipt' ? 'receipt' : 'invoice';
          setActiveDocTypeTab(activeTabForDoc);
          // Instantly update invoices list and preview modal
          const freshRes = await fetch(`/api/crm/invoices?workspaceId=${activeWorkspace.id}`);
          if (freshRes.ok) {
            const freshInvoices: Invoice[] = await freshRes.json();
            setInvoices(freshInvoices);
            const updatedInv = freshInvoices.find(i => i.id === editedId);
            if (updatedInv) {
              const targetClient = clients.find(c => c.id === updatedInv.clientId);
              setSelectedInvoice({
                ...updatedInv,
                clientName: updatedInv.clientName || targetClient?.companyName || clientName || 'Selected Client'
              });
            }
          }
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to update invoice');
        }
      } else {
        // CREATE new invoice via POST
        const res = await fetch('/api/crm/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: activeWorkspace.id,
            clientId,
            invoiceNumber,
            issueDate,
            dueDate,
            status: 'sent',
            items: resolvedItems,
            discount: totals.discount,
            currency: invoiceCurrency,
            notes: JSON.stringify(metadata),
            total: totals.total
          })
        });
        if (res.ok) {
          setShowAddModal(false);
          const activeTabForDoc = docType === 'proforma' ? 'proforma' : docType === 'receipt' ? 'receipt' : 'invoice';
          setActiveDocTypeTab(activeTabForDoc);
          fetchInvoices();
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to create invoice');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setCreating(false);
    }
  };

  // Change status of existing invoice with instant optimistic feedback
  const handleUpdateStatus = async (id: string, newStatus: Invoice['status']) => {
    if (!activeWorkspace) return;
    const prevInvoices = invoices;
    const prevSelected = selectedInvoice;

    // Instant optimistic update
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: newStatus } : inv));
    if (selectedInvoice && selectedInvoice.id === id) {
      setSelectedInvoice(prev => prev ? { ...prev, status: newStatus } : null);
    }
    setSheetConfig(prev => ({
      ...prev,
      syncedInvoiceIds: (prev.syncedInvoiceIds || []).filter(invId => invId !== id)
    }));

    try {
      const res = await fetch('/api/crm/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          workspaceId: activeWorkspace.id,
          status: newStatus
        })
      });
      if (!res.ok) {
        // Revert on failure
        setInvoices(prevInvoices);
        setSelectedInvoice(prevSelected);
      }
    } catch (err) {
      console.error(err);
      setInvoices(prevInvoices);
      setSelectedInvoice(prevSelected);
    }
  };

  // Delete invoice
  const handleDeleteInvoice = async (id: string) => {
    if (!activeWorkspace) return;
    const ok = await confirm({
      title: 'Delete Invoice',
      message: 'Are you sure you want to delete this invoice? This record will be permanently deleted.',
      confirmText: 'Delete Invoice',
      variant: 'danger',
    });
    if (!ok) return;
    const targetInvoice = invoices.find(inv => inv.id === id);
    try {
      const res = await fetch(`/api/crm/invoices?id=${id}&workspaceId=${activeWorkspace.id}`, {
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
              action: 'delete_invoice',
              data: { id, invoiceNumber: targetInvoice?.invoiceNumber }
            })
          }).catch(() => {});
        } catch {}

        setInvoices(prev => prev.filter(inv => inv.id !== id));
        setSelectedInvoice(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Generate structured invoice data payload for AI & JSON export
  const generateInvoiceJsonPayload = (inv: Invoice) => {
    let meta = {
      template: 'classic',
      docType: 'invoice',
      placeOfSupply: '',
      gstRate: 18,
      gstType: 'igst',
      advancePct: 20,
      requireAdvance: true,
      notesText: 'We appreciate the opportunity to work with you!',
      clientGst: '',
      clientPhone: '',
      clientEmail: '',
      clientAddress: '',
      clientName: inv.clientName,
      gstTreatment: 'gst_applicable',
      invoiceCurrency: 'INR'
    };

    try {
      if (inv.notes && inv.notes.startsWith('{')) {
        meta = { ...meta, ...JSON.parse(inv.notes) };
      } else if (inv.notes) {
        meta.notesText = inv.notes;
      }
    } catch {}

    const client = clients.find(c => c.id === inv.clientId);
    const clientName = meta.clientName || client?.companyName || inv.clientName || 'Valued Client';
    const clientEmail = meta.clientEmail || client?.email || '';
    const clientPhone = meta.clientPhone || client?.phone || '';
    const clientAddress = meta.clientAddress || client?.address || '';
    const clientGst = meta.clientGst || client?.gstNumber || '';

    const invDocType = getDocTypeFromInvoice(inv);
    const docTypeLabel = invDocType === 'proforma' ? 'Proforma Invoice' : invDocType === 'receipt' ? 'Payment Receipt' : 'Tax Invoice';

    const subtotal = inv.subtotal || inv.items?.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0) || 0;
    const taxTotal = inv.taxTotal || 0;
    const total = inv.total || 0;
    const isLut = meta.gstTreatment === 'lut_export';

    const cleanBizName = (businessProfile.name || 'Docdril').replace(/[!.]+$/, '');
    const cleanBizEmail = (businessProfile.email || '').replace(/@docdril\.in$/i, '@docdril.com') || 'info@docdril.com';

    return {
      invoiceNumber: inv.invoiceNumber,
      documentType: docTypeLabel,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency: meta.invoiceCurrency || inv.currency || 'INR',
      currencySymbol: getCurrencySymbol(meta.invoiceCurrency || inv.currency || 'INR'),
      issuedBy: {
        companyName: cleanBizName,
        tagline: businessProfile.tagline || 'Creative-tech studio',
        email: cleanBizEmail,
        phone: businessProfile.phone || '+91 6203526454',
        website: businessProfile.web || 'docdril.com',
        gstin: businessProfile.gstin || '',
        address: businessProfile.addr || '',
        bankDetails: businessProfile.bank || '',
        upiId: businessProfile.upiId || '',
        lutNumber: businessProfile.lutNumber || ''
      },
      billedTo: {
        clientName,
        companyName: client?.companyName || clientName,
        email: clientEmail,
        phone: clientPhone,
        address: clientAddress,
        gstin: clientGst,
        placeOfSupply: meta.placeOfSupply || ''
      },
      items: (inv.items || []).map((item, idx) => ({
        index: idx + 1,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRatePct: item.taxRate ?? meta.gstRate ?? 18,
        amount: item.quantity * item.unitPrice
      })),
      financials: {
        subtotal: Number(subtotal.toFixed(2)),
        discount: inv.discount || 0,
        taxTreatment: isLut ? 'Export under LUT (Zero-rated)' : `${meta.gstType.toUpperCase()} @ ${meta.gstRate}%`,
        taxTotal: Number(taxTotal.toFixed(2)),
        grandTotal: Number(total.toFixed(2)),
        advancePercentage: meta.requireAdvance ? meta.advancePct : 0,
        advanceAmount: meta.requireAdvance ? Number(((total * meta.advancePct) / 100).toFixed(2)) : 0
      },
      notesAndTerms: {
        notes: meta.notesText || 'We appreciate the opportunity to work with you!',
        closingMessage: `Thank you for your business with ${cleanBizName}`
      }
    };
  };

  const handleCopyForAi = (inv: Invoice) => {
    const payload = generateInvoiceJsonPayload(inv);
    const sym = payload.currencySymbol || '₹';
    const itemsFormatted = (payload.items || [])
      .map(
        (it) =>
          `  - ${it.description}: Qty ${it.quantity} × ${sym}${it.unitPrice.toLocaleString()} = ${sym}${it.amount.toLocaleString()}`
      )
      .join('\n');

    const prompt = `Please generate a realistic, high-resolution, and professional image of a beautifully designed invoice using the following details.

Style & Visual Guidelines:
1. Format & Presentation: High-resolution full A4 vertical portrait document image, flat-lay / clean top-down presentation, sleek and ultra-modern aesthetic.
2. Design Style: Minimalist executive branding, crisp modern typography, elegant spacing, subtle indigo/slate accents on a pristine white background.
3. Visual Content to Display in the Image:
   - Header: "${payload.issuedBy.companyName}" branding, title "${payload.documentType}", Invoice #: "${payload.invoiceNumber}"
   - Dates: Issue Date: "${payload.issueDate}", Due Date: "${payload.dueDate}"
   - Issued By: ${payload.issuedBy.companyName} | Email: ${payload.issuedBy.email} | Phone: ${payload.issuedBy.phone} | Web: ${payload.issuedBy.website}
   - Billed To Client: ${payload.billedTo.clientName}${payload.billedTo.email ? ` (${payload.billedTo.email})` : ''}${payload.billedTo.address ? ` | ${payload.billedTo.address}` : ''}
   - Itemized Table:
${itemsFormatted}
   - Financial Totals:
     * Subtotal: ${sym}${payload.financials.subtotal.toLocaleString()}
     * Tax: ${sym}${payload.financials.taxTotal.toLocaleString()}
     * Grand Total: ${sym}${payload.financials.grandTotal.toLocaleString()}
   - Payment Details:
     * Bank: ${payload.issuedBy.bankDetails || 'Bank transfer details'}
     * UPI ID: ${payload.issuedBy.upiId || 'docdril@upi'}
   - Footer:
     * "${payload.notesAndTerms.closingMessage}"
     * Contact: ${payload.issuedBy.email}

Please generate an attractive, high-quality visual image depicting this invoice in the most beautiful manner.

Structured Data Reference:
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopiedAi(true);
    setTimeout(() => setCopiedAi(false), 2500);
  };

  const handleCopyRawJson = (inv: Invoice) => {
    const payload = generateInvoiceJsonPayload(inv);
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  // Document template HTML builder
  const buildInvoiceHTML = (inv: Invoice, style: 'classic' | 'modern' | 'compact', forPrint = false) => {
    let meta = {
      template: 'classic',
      docType: 'invoice',
      placeOfSupply: '',
      gstRate: 18,
      gstType: 'igst',
      advancePct: 20,
      requireAdvance: true,
      notesText: 'We appreciate the opportunity to work with you!',
      clientGst: '',
      clientPhone: '',
      clientEmail: '',
      clientAddress: '',
      clientName: inv.clientName,
      gstTreatment: 'gst_applicable',
      invoiceCurrency: 'INR'
    };

    try {
      if (inv.notes && inv.notes.startsWith('{')) {
        meta = { ...meta, ...JSON.parse(inv.notes) };
      } else {
        meta.notesText = inv.notes || '';
      }
    } catch {}

    const numUpper = (inv.invoiceNumber || '').trim().toUpperCase();
    let resolvedDocType: 'invoice' | 'proforma' | 'receipt' = 'invoice';
    if (numUpper.startsWith('PRO-') || numUpper.startsWith('PROFORMA')) {
      resolvedDocType = 'proforma';
    } else if (numUpper.startsWith('REC-') || numUpper.startsWith('RECEIPT')) {
      resolvedDocType = 'receipt';
    } else if (numUpper.startsWith('DOC-')) {
      resolvedDocType = 'invoice';
    } else if (meta.docType === 'proforma' || meta.docType === 'receipt') {
      resolvedDocType = meta.docType;
    }

    const isProforma = resolvedDocType === 'proforma';
    const isReceipt = resolvedDocType === 'receipt';
    const docTitle = isProforma ? 'Proforma Invoice' : isReceipt ? 'Receipt' : 'Tax Invoice';
    const docNumLabel = isProforma ? 'Proforma No.' : isReceipt ? 'Receipt No.' : 'Invoice No.';
    const dateLabel = isReceipt ? 'Receipt Date:' : 'Date:';
    const dueDateLabel = isReceipt ? 'Payment Date:' : isProforma ? 'Valid Till:' : 'Due Date:';
    const isI = !isReceipt;
    const sub = inv.subtotal || inv.total;
    const flatDiscount = inv.discount || 0;
    const taxable = sub - flatDiscount;
    const gAmt = inv.taxTotal || 0;
    const total = inv.total;
    const advAmt = total * (meta.advancePct / 100);
    const f2 = (n: number) => n.toFixed(2);

    const isModern = style === 'modern';
    const isCompact = style === 'compact';
    const isClassic = style === 'classic';

    const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    const cellPadding = isCompact ? '4px 6px' : '8px 10px';
    const itemFontSize = isCompact ? '10px' : '11.5px';

    const itemsRows = (inv.items || []).map((it, i) => `
      <tr style="border-bottom:1px solid ${isCompact ? '#f1f5f9' : '#e2e8f0'}">
        <td style="padding:${cellPadding}; color:#000000; vertical-align:top; font-size:${itemFontSize}">${i+1}</td>
        <td style="padding:${cellPadding}; color:#000000; font-weight:600; vertical-align:top; font-size:${itemFontSize}">${it.description || '—'}</td>
        <td style="padding:${cellPadding}; text-align:center; color:#000000; vertical-align:top; font-size:${itemFontSize}">${it.quantity}</td>
        <td style="padding:${cellPadding}; text-align:right; color:#000000; vertical-align:top; font-size:${itemFontSize}">₹${f2(it.unitPrice)}</td>
        <td style="padding:${cellPadding}; text-align:right; font-weight:700; color:#000000; vertical-align:top; font-size:${itemFontSize}">₹${f2(it.quantity * it.unitPrice)}</td>
      </tr>
    `).join('');

    const discountRow = flatDiscount > 0 ? `
      <tr>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">Discount</td>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">-₹${f2(flatDiscount)}</td>
      </tr>
    ` : '';

    const gstRows = (gAmt > 0 && meta.gstTreatment !== 'lut_export') ? (
      meta.gstType === 'igst' ? `
        <tr>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">IGST @${meta.gstRate}%</td>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">₹${f2(gAmt)}</td>
        </tr>
      ` : `
        <tr>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">CGST @${meta.gstRate/2}%</td>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">₹${f2(gAmt/2)}</td>
        </tr>
        <tr>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">SGST @${meta.gstRate/2}%</td>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">₹${f2(gAmt/2)}</td>
        </tr>
      `
    ) : '';

    const showAdvance = !isReceipt && meta.requireAdvance !== false && meta.advancePct > 0;
    const advBox = isReceipt ? `
      <div style="margin-top:${isCompact ? '6px' : '12px'}; margin-bottom:${isCompact ? '2px' : '4px'}; font-size:${isCompact ? '9.5px' : '11px'}; color:#000000">
        <b>Payment Status:</b> Payment acknowledged and received in full with thanks.
      </div>
    ` : showAdvance ? `
      <div style="margin-top:${isCompact ? '6px' : '12px'}; margin-bottom:${isCompact ? '2px' : '4px'}; font-size:${isCompact ? '9.5px' : '11px'}; color:#000000">
        <b>${isProforma ? 'Advance Terms' : 'Payment Terms'}:</b> ${meta.advancePct}% advance payment (<b>₹${f2(advAmt)}</b>) ${isProforma ? 'required upon order confirmation.' : 'required to initiate the project stages.'}
      </div>
    ` : '';

    const hdrBg = isModern
      ? 'background:#000000; color:#ffffff; padding:18px 22px; border-radius:10px; margin-bottom:18px;'
      : isCompact
      ? 'border-bottom:1.5px solid #000000; padding-bottom:8px; margin-bottom:10px;'
      : 'border-bottom:2px solid #000000; padding-bottom:16px; margin-bottom:18px;';

    const subCol = isModern ? '#ffffff' : '#000000';
    const titleCol = isModern ? '#ffffff' : '#000000';

    const logoSrc = businessProfile.logo || '/logo.png';
    const logoBlock = logoSrc ? `
      <div style="margin-bottom:${isCompact ? '5px' : '10px'}">
        <img src="${logoSrc}" style="height:${isCompact ? '42px' : '58px'}; width:${isCompact ? '42px' : '58px'}; object-fit:contain; display:block; border-radius:8px; ${isModern ? 'background:#ffffff; padding:3px;' : ''}" alt="Logo" />
      </div>
    ` : '';

    const headerBlock = `
      <div class="inv-header" style="${hdrBg} display:flex; justify-content:space-between; align-items:flex-start">
        <div class="inv-header-left" style="max-width:55%">
          ${logoBlock}
          <div style="font-size:${isCompact ? '18px' : '22px'}; font-weight:900; letter-spacing:-0.5px; color:${titleCol}; line-height:1.2">${businessProfile.name || 'Docdril'}</div>
          ${businessProfile.tagline ? `<div style="font-size:${isCompact ? '10px' : '11px'}; font-weight:600; color:${subCol}; margin-top:${isCompact ? '2px' : '3px'}; letter-spacing:0.02em">${businessProfile.tagline}</div>` : ''}
          <div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:${subCol}; margin-top:${isCompact ? '2px' : '3px'}">${businessProfile.web || 'docdril.com'}${businessProfile.email ? ` &nbsp;•&nbsp; ${businessProfile.email}` : ''}</div>
          ${businessProfile.gstin ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; font-weight:700; color:${titleCol}; margin-top:3px"><b>GSTIN:</b> ${businessProfile.gstin}</div>` : ''}
        </div>
        <div class="inv-header-right" style="text-align:right">
          <div style="font-size:${isCompact ? '14px' : '16px'}; font-weight:900; text-transform:uppercase; color:${titleCol}; letter-spacing:0.06em">${docTitle}</div>
          <div style="font-size:${isCompact ? '10px' : '11px'}; color:${subCol}; margin-top:${isCompact ? '3px' : '6px'}"><b style="color:${titleCol}">${docNumLabel}</b> ${inv.invoiceNumber}</div>
          <div style="font-size:${isCompact ? '10px' : '11px'}; color:${subCol}; margin-top:2px"><b style="color:${titleCol}">${dateLabel}</b> ${inv.issueDate}</div>
          ${inv.dueDate ? `<div style="font-size:${isCompact ? '10px' : '11px'}; color:${subCol}; margin-top:2px"><b style="color:${titleCol}">${dueDateLabel}</b> ${inv.dueDate}</div>` : ''}
        </div>
      </div>
    `;

    const partiesBlock = `
      <table class="inv-parties" style="width:100%; border-collapse:collapse; margin-bottom:${isCompact ? '10px' : '20px'}">
        <tr>
          <td class="inv-party-billed" style="width:50%; vertical-align:top; padding-right:15px">
            <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '2px' : '5px'}">${isReceipt ? 'Received From' : 'Billed To'}</div>
            <div style="font-size:${isCompact ? '12px' : '13.5px'}; font-weight:800; color:#000000; margin-bottom:2px">${meta.clientName || inv.clientName}</div>
            ${meta.clientGst ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; margin-bottom:2px"><b>GSTIN:</b> ${meta.clientGst}</div>` : ''}
            ${meta.clientAddress ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; line-height:1.35; margin-bottom:2px">${meta.clientAddress}</div>` : ''}
            ${meta.clientPhone ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Phone: ${meta.clientPhone}</div>` : ''}
            ${meta.clientEmail ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Email: ${meta.clientEmail}</div>` : ''}
          </td>
          <td class="inv-party-issued" style="width:50%; vertical-align:top; padding-left:15px">
            <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '2px' : '5px'}">Issued By</div>
            <div style="font-size:${isCompact ? '12px' : '13.5px'}; font-weight:800; color:#000000; margin-bottom:2px">${businessProfile.name || 'Docdril'}</div>
            ${businessProfile.gstin ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; margin-bottom:2px"><b>GSTIN:</b> ${businessProfile.gstin}</div>` : ''}
            <div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; line-height:1.35; margin-bottom:2px">${businessProfile.addr}</div>
            <div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Phone: ${businessProfile.phone}</div>
            ${businessProfile.email ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Email: ${businessProfile.email.replace(/@docdril\.in$/i, '@docdril.com')}</div>` : ''}
            ${meta.placeOfSupply ? `<div style="margin-top:3px; font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000"><b>Place of Supply:</b> ${meta.placeOfSupply}</div>` : ''}
          </td>
        </tr>
      </table>
    `;

    const tableHeaderBg = isModern ? '#f1f5f9' : '#ffffff';
    const totalBorderBottom = '2px solid #000000';
    const totalRowLabel = isReceipt ? 'Total Received' : isProforma ? 'Estimated Total' : 'Total Payable';

    const tableBlock = `
      <div class="inv-table-wrap" style="width:100%">
        <table class="inv-items-table" style="width:100%; border-collapse:collapse; margin-bottom:${isCompact ? '8px' : '12px'}; font-size:${itemFontSize}">
          <thead>
            <tr style="background:${tableHeaderBg}; color:#000000; font-size:${isCompact ? '9px' : '10px'}; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; border-top:1.5px solid #000000; border-bottom:1.5px solid #000000">
              <th style="padding:${cellPadding}; text-align:left; width:6%">#</th>
              <th style="padding:${cellPadding}; text-align:left; width:48%">Description</th>
              <th style="padding:${cellPadding}; text-align:center; width:12%">Qty</th>
              <th style="padding:${cellPadding}; text-align:right; width:17%">Price</th>
              <th style="padding:${cellPadding}; text-align:right; width:17%">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <div class="inv-total-wrap" style="display:flex; justify-content:flex-end; margin-bottom:${isCompact ? '8px' : '14px'}">
        <table style="width:${isCompact ? '230px' : '280px'}; border-collapse:collapse; font-size:${isCompact ? '10px' : '11.5px'}">
          <tr>
            <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">Subtotal</td>
            <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:600; color:#000000">₹${f2(sub)}</td>
          </tr>
          ${discountRow}
          ${gstRows}
          <tr style="border-top:2px solid #000000; border-bottom:${totalBorderBottom}">
            <td style="padding:${isCompact ? '4px 6px' : '8px 8px'}; font-size:${isCompact ? '11px' : '13px'}; font-weight:900; color:#000000; text-transform:uppercase">${totalRowLabel}</td>
            <td style="padding:${isCompact ? '4px 6px' : '8px 8px'}; text-align:right; font-size:${isCompact ? '12px' : '14px'}; font-weight:900; color:#000000">₹${f2(total)}</td>
          </tr>
        </table>
      </div>
    `;

    const qrSize = isCompact ? 95 : 135;
    const qrImageBlock = businessProfile.qrCode ? `
      <div style="background:#ffffff; padding:${isCompact ? '5px' : '7px'}; border:1px solid #d1d5db; border-radius:6px; display:inline-block; line-height:0; margin-bottom:${isCompact ? '4px' : '8px'}">
        <img src="${businessProfile.qrCode}" style="width:${qrSize}px; height:${qrSize}px; object-fit:contain; image-rendering:-webkit-optimize-contrast; image-rendering:crisp-edges; display:block" alt="UPI QR Code" />
      </div>
    ` : '';

    const paymentBlock = isReceipt ? `
      <div style="border-top:${isCompact ? '1px' : '1.5px'} solid #000000; margin-top:${isCompact ? '10px' : '20px'}; padding-top:${isCompact ? '8px' : '14px'}">
        <table class="inv-payment-table" style="width:100%; border-collapse:collapse">
          <tr>
            <td class="inv-pay-info" style="vertical-align:top; width:56%; padding-right:16px">
              <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '3px' : '6px'}">Payment Confirmation</div>
              <div style="font-size:${isCompact ? '9.5px' : '11px'}; line-height:${isCompact ? '1.4' : '1.6'}; color:#000000">
                Payment received and credited to bank account.<br>
                Thank you for your prompt settlement.
              </div>
            </td>
            <td class="inv-pay-extra" style="vertical-align:top; text-align:right; width:44%">
              <div style="display:inline-block; border:1.5px solid #000000; border-radius:8px; padding:${isCompact ? '6px 12px' : '8px 16px'}; text-align:center">
                <div style="font-size:${isCompact ? '8px' : '9px'}; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#000000">Official Receipt</div>
                <div style="font-size:${isCompact ? '12px' : '14px'}; font-weight:900; color:#000000; margin-top:2px">PAID IN FULL</div>
              </div>
            </td>
          </tr>
        </table>
      </div>
    ` : `
      <div style="border-top:${isCompact ? '1px' : '1.5px'} solid #000000; margin-top:${isCompact ? '10px' : '20px'}; padding-top:${isCompact ? '8px' : '14px'}">
        <table class="inv-payment-table" style="width:100%; border-collapse:collapse">
          <tr>
            <td class="inv-pay-info" style="vertical-align:top; width:54%; padding-right:16px">
              <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '3px' : '6px'}">Bank Transfer Details</div>
              <div style="font-size:${isCompact ? '9.5px' : '11px'}; line-height:${isCompact ? '1.4' : '1.6'}; color:#000000">${businessProfile.bank ? businessProfile.bank.replace(/\n/g, '<br>') : ''}</div>
            </td>
            <td class="inv-pay-extra" style="vertical-align:top; text-align:right; width:46%">
              <div class="qr-col" style="display:inline-flex; flex-direction:column; align-items:flex-end; text-align:right">
                ${qrImageBlock}
                <div style="font-size:${isCompact ? '8px' : '9px'}; color:#000000; margin-bottom:2px; text-transform:uppercase; font-weight:800; letter-spacing:0.04em">UPI ID (Scan & Pay)</div>
                <div style="font-weight:900; font-size:${isCompact ? '11px' : '12.5px'}; color:#000000; font-family:monospace">${businessProfile.upiId || ''}</div>
                <div style="font-size:${isCompact ? '8px' : '9px'}; color:#000000; margin-top:2px">Pay via GPAY, PhonePe, or Paytm</div>
              </div>
            </td>
          </tr>
        </table>
      </div>
    `;

    const notesBlock = meta.notesText ? `
      <div style="margin-top:${isCompact ? '6px' : '14px'}; font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; line-height:1.4">
        <b>Note:</b> <i>${meta.notesText}</i>
      </div>
    ` : '';

    const isLut = meta.gstTreatment === 'lut_export';
    const lutNumberText = businessProfile.lutNumber ? ` (LUT Ref No: ${businessProfile.lutNumber})` : '';
    const lutWarningBlock = isLut ? `
      <div style="margin-top:${isCompact ? '6px' : '10px'}; font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; font-weight:700">
        Supply meant for Export under LUT without payment of IGST.${lutNumberText}
      </div>
    ` : '';

    const rawBizEmail = businessProfile.email || '';
    const bizEmail = rawBizEmail.replace(/@docdril\.in$/i, '@docdril.com') || 'info@docdril.com';
    const rawBizName = businessProfile.name || 'Docdril';
    const bizName = rawBizName.replace(/[!.]+$/, '');
    const footerBlock = `
      <div style="border-top:1px solid #000000; margin-top:${isCompact ? '12px' : '24px'}; padding-top:${isCompact ? '6px' : '12px'}; text-align:center; font-size:${isCompact ? '8.5px' : '10px'}; color:#000000">
        ${isReceipt ? 'Thank you for your payment!' : `Thank you for your business with ${bizName}`} ${bizEmail ? ` &nbsp;•&nbsp; email: ${bizEmail}` : ''}
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
          <title>${inv.invoiceNumber || 'invoice'}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0mm;
            }
            @media print {
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              .page-sheet {
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                padding: ${isCompact ? '8mm 10mm' : '14mm 16mm'} !important;
                box-shadow: none !important;
                border: none !important;
              }
              .inv-table-wrap {
                overflow: visible !important;
              }
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: ${fontFamily};
              font-size: ${isCompact ? '10px' : '11.5px'};
              color: #0f172a;
              margin: 0;
              padding: 0;
              background: ${forPrint ? '#ffffff' : '#f8fafc'};
              -webkit-font-smoothing: antialiased;
            }
            .page-sheet {
              width: 100%;
              max-width: ${forPrint ? '100%' : '800px'};
              margin: 0 auto;
              padding: ${forPrint ? (isCompact ? '8mm 10mm' : '14mm 16mm') : (isCompact ? '14px 18px' : '24px')};
              background: #ffffff;
              min-height: ${forPrint ? '297mm' : 'auto'};
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
            }
            @media screen and (max-width: 640px) {
              body {
                padding: 0 !important;
                background: #ffffff !important;
              }
              .page-sheet {
                padding: 12px 10px !important;
                width: 100% !important;
              }
              .inv-header {
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 10px !important;
              }
              .inv-header-left {
                max-width: 100% !important;
                width: 100% !important;
              }
              .inv-header-right {
                text-align: left !important;
                width: 100% !important;
                border-top: 1px dashed rgba(0,0,0,0.15) !important;
                padding-top: 8px !important;
              }
              .inv-parties, .inv-parties tbody, .inv-parties tr, .inv-parties td {
                display: block !important;
                width: 100% !important;
                padding: 0 !important;
              }
              .inv-party-billed {
                margin-bottom: 12px !important;
                padding-bottom: 10px !important;
                border-bottom: 1px dashed #e2e8f0 !important;
              }
              .inv-table-wrap {
                overflow-x: auto !important;
                -webkit-overflow-scrolling: touch !important;
                margin-bottom: 8px !important;
              }
              .inv-items-table {
                min-width: 440px !important;
              }
              .inv-total-wrap {
                width: 100% !important;
              }
              .inv-total-wrap table {
                width: 100% !important;
              }
              .inv-payment-table, .inv-payment-table tbody, .inv-payment-table tr, .inv-payment-table td {
                display: block !important;
                width: 100% !important;
                padding: 0 !important;
              }
              .inv-pay-extra {
                margin-top: 12px !important;
                text-align: left !important;
              }
              .qr-col {
                align-items: flex-start !important;
                text-align: left !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="page-sheet">
            <div>
              ${headerBlock}
              ${partiesBlock}
              ${tableBlock}
              ${advBox}
              ${paymentBlock}
              ${notesBlock}
              ${lutWarningBlock}
            </div>
            ${footerBlock}
          </div>
        </body>
      </html>
    `;
  };

  // Actions trigger: print / save pdf
  const handlePrintPdf = (inv: Invoice) => {
    const docName = (inv.invoiceNumber || 'invoice').trim();
    const originalTitle = document.title;
    // Set parent document title so browser "Save as PDF" dialog defaults to invoice number
    document.title = docName;

    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('focus', restoreTitle);
    };
    window.addEventListener('focus', restoreTitle, { once: true });
    window.addEventListener('afterprint', restoreTitle, { once: true });
    setTimeout(restoreTitle, 10000);

    const html = buildInvoiceHTML(inv, previewTpl, true);
    const pa = printAreaRef.current;
    if (!pa) return;

    pa.innerHTML = `<iframe id="pf-frame" style="position:fixed;top:-10000px;left:-10000px;width:1000px;height:1400px;border:none;" srcdoc="${html.replace(/"/g, '&quot;')}"></iframe>`;
    pa.style.display = 'block';

    const iframe = document.getElementById('pf-frame') as HTMLIFrameElement;
    if (iframe) {
      iframe.onload = () => {
        try {
          if (iframe.contentDocument) {
            iframe.contentDocument.title = docName;
          }
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          const w = window.open('', '_blank', 'width=800,height=900');
          if (w) {
            w.document.write(html);
            w.document.title = docName;
            w.document.close();
            w.onload = () => w.print();
          }
        }
        setTimeout(() => {
          pa.style.display = 'none';
          pa.innerHTML = '';
        }, 1000);
      };
    }
  };

  // Actions trigger: download HTML file
  const handleDownloadHtml = (inv: Invoice) => {
    const html = buildInvoiceHTML(inv, previewTpl, false);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${inv.invoiceNumber || 'invoice'}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">No Workspace Selected</h2>
          <p className="text-xs text-slate-500 mt-1">Select a workspace to view billing details.</p>
        </div>
      </div>
    );
  }

  const selectedClient = clients.find(c => c.id === filterClientId);
  const selectedMonthName = filterMonth !== 'all' ? MONTH_NAMES[parseInt(filterMonth, 10)] : null;
  const scopedInvoices = invoices.filter(i => {
    if (filterClientId !== 'all' && i.clientId !== filterClientId) return false;
    if (filterTag !== 'all') {
      const c = clients.find(cl => cl.id === i.clientId);
      if (filterTag === 'Untagged') {
        if (c?.tags && c.tags.length > 0) return false;
      } else {
        if (!c?.tags?.includes(filterTag)) return false;
      }
    }
    if (filterMonth !== 'all') {
      const parts = (i.issueDate || i.dueDate || '').split('-');
      const mNum = parseInt(parts[1] || '0', 10);
      if (String(mNum - 1) !== filterMonth) return false;
    }
    return true;
  });
  const paidInvoices = scopedInvoices.filter(i => i.status === 'paid');
  const pendingInvoices = scopedInvoices.filter(i => i.status === 'sent');
  const totalBilled = scopedInvoices.reduce((a, i) => a + i.total, 0);
  const totalCollected = paidInvoices.reduce((a, i) => a + i.total, 0);

  const scopeLabelSuffix = [
    selectedClient ? selectedClient.companyName : (filterTag !== 'all' ? `Tag: ${filterTag}` : null),
    selectedMonthName ? selectedMonthName : null,
  ].filter(Boolean).join(' · ');

  // Selected Report Month and Year calculations for GST filing
  const selectedReportMonthNum = useMemo(() => {
    if (filterMonth !== 'all') return parseInt(filterMonth, 10);
    for (let m = 11; m >= 0; m--) {
      const hasInv = invoices.some(i => {
        const parts = (i.issueDate || i.dueDate || '').split('-');
        return parseInt(parts[1] || '0', 10) === m + 1;
      });
      if (hasInv) return m;
    }
    return new Date().getMonth();
  }, [filterMonth, invoices]);

  const selectedReportMonthName = MONTH_NAMES[selectedReportMonthNum];

  const selectedReportYear = useMemo(() => {
    const matched = invoices.find(inv => {
      const d = inv.issueDate || inv.dueDate || '';
      const parts = d.split('-');
      return parseInt(parts[1] || '0', 10) === selectedReportMonthNum + 1;
    });
    if (matched) {
      const parts = (matched.issueDate || matched.dueDate || '').split('-');
      if (parts[0]) return parts[0];
    }
    return String(new Date().getFullYear());
  }, [invoices, selectedReportMonthNum]);

  // Tax Invoices strictly for the selected month
  const monthlyTaxInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (getDocTypeFromInvoice(inv) !== 'invoice') return false;
      const dStr = inv.issueDate || inv.dueDate || '';
      const parts = dStr.split('-');
      const monthNum = parseInt(parts[1] || '0', 10);
      if (monthNum !== selectedReportMonthNum + 1) return false;
      return true;
    }).map(inv => {
      let meta: any = {};
      try {
        if (inv.notes && inv.notes.startsWith('{')) meta = JSON.parse(inv.notes);
      } catch {}
      const matchedClient = clients.find(c => c.id === inv.clientId);

      const clientName = meta.clientName || inv.clientName || matchedClient?.companyName || 'Unknown Client';
      const clientGst = (meta.clientGst || matchedClient?.gstNumber || '').trim();
      const placeOfSupply = meta.placeOfSupply || matchedClient?.placeOfSupply || 'Bihar (10)';
      const gstTreatment = meta.gstTreatment || matchedClient?.gstTreatmentOverride || 'gst_applicable';
      const isLut = gstTreatment === 'lut_export';
      const gstRate = isLut ? 0 : (Number(meta.gstRate) || 18);
      
      const subtotal = Number(inv.subtotal) || 0;
      const taxTotal = isLut ? 0 : (Number(inv.taxTotal) || 0);
      const total = isLut ? subtotal : (Number(inv.total) || (subtotal + taxTotal));

      // Docdril State is Bihar (10). If POS is Bihar, split CGST + SGST. Otherwise IGST.
      const isBihar = placeOfSupply.includes('(10)') || placeOfSupply.toLowerCase().includes('bihar') || meta.gstType === 'cgst';

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (!isLut && taxTotal > 0) {
        if (isBihar) {
          cgst = Math.round((taxTotal / 2) * 100) / 100;
          sgst = Math.round((taxTotal / 2) * 100) / 100;
        } else {
          igst = taxTotal;
        }
      }

      const isB2B = Boolean(clientGst && clientGst.length > 5);

      return {
        ...inv,
        meta,
        clientName,
        clientGst,
        isB2B,
        placeOfSupply,
        gstTreatment,
        isLut,
        gstRate,
        subtotal,
        taxTotal,
        total,
        cgst,
        sgst,
        igst,
        isBihar
      };
    });
  }, [invoices, selectedReportMonthNum, clients]);

  // Aggregated totals for GST filing
  const gstReportSummary = useMemo(() => {
    let totalTaxable = 0;
    let totalTax = 0;
    let totalIgst = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalGross = 0;

    let b2bCount = 0;
    let b2bTaxable = 0;
    let b2bTax = 0;

    let b2cCount = 0;
    let b2cTaxable = 0;
    let b2cTax = 0;

    let exportCount = 0;
    let exportTaxable = 0;

    const stateMap: Record<string, { pos: string; isIntra: boolean; count: number; taxable: number; igst: number; cgst: number; sgst: number; total: number }> = {};

    monthlyTaxInvoices.forEach(item => {
      if (item.status === 'void') return;

      totalTaxable += item.subtotal;
      totalTax += item.taxTotal;
      totalIgst += item.igst;
      totalCgst += item.cgst;
      totalSgst += item.sgst;
      totalGross += item.total;

      if (item.isLut) {
        exportCount++;
        exportTaxable += item.subtotal;
      } else if (item.isB2B) {
        b2bCount++;
        b2bTaxable += item.subtotal;
        b2bTax += item.taxTotal;
      } else {
        b2cCount++;
        b2cTaxable += item.subtotal;
        b2cTax += item.taxTotal;
      }

      const posKey = item.placeOfSupply || 'Other';
      if (!stateMap[posKey]) {
        stateMap[posKey] = { pos: posKey, isIntra: item.isBihar, count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
      }
      stateMap[posKey].count++;
      stateMap[posKey].taxable += item.subtotal;
      stateMap[posKey].igst += item.igst;
      stateMap[posKey].cgst += item.cgst;
      stateMap[posKey].sgst += item.sgst;
      stateMap[posKey].total += item.total;
    });

    return {
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalIgst: Math.round(totalIgst * 100) / 100,
      totalCgst: Math.round(totalCgst * 100) / 100,
      totalSgst: Math.round(totalSgst * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
      b2bCount,
      b2bTaxable: Math.round(b2bTaxable * 100) / 100,
      b2bTax: Math.round(b2bTax * 100) / 100,
      b2cCount,
      b2cTaxable: Math.round(b2cTaxable * 100) / 100,
      b2cTax: Math.round(b2cTax * 100) / 100,
      exportCount,
      exportTaxable: Math.round(exportTaxable * 100) / 100,
      stateBreakdown: Object.values(stateMap).sort((a, b) => b.taxable - a.taxable)
    };
  }, [monthlyTaxInvoices]);

  const copyGstSummaryToClipboard = () => {
    const text = `GST Filing Summary — ${selectedReportMonthName} ${selectedReportYear}
Docdril | GSTIN: ${businessProfile.gstin || '10CKTPC0886R1ZL'} | State: Bihar (10)
--------------------------------------------------
Tax Invoices: ${monthlyTaxInvoices.length}
Total Taxable Value (Turnover): ₹${gstReportSummary.totalTaxable.toFixed(2)}
Integrated Tax (IGST): ₹${gstReportSummary.totalIgst.toFixed(2)}
Central Tax (CGST): ₹${gstReportSummary.totalCgst.toFixed(2)}
State Tax (SGST): ₹${gstReportSummary.totalSgst.toFixed(2)}
Total GST Payable: ₹${gstReportSummary.totalTax.toFixed(2)}
Total Invoiced (Gross): ₹${gstReportSummary.totalGross.toFixed(2)}

GSTR-1 Segregation:
• B2B (Registered with GSTIN): ${gstReportSummary.b2bCount} invoices | Taxable: ₹${gstReportSummary.b2bTaxable.toFixed(2)} | Tax: ₹${gstReportSummary.b2bTax.toFixed(2)}
• B2C (Domestic Unregistered): ${gstReportSummary.b2cCount} invoices | Taxable: ₹${gstReportSummary.b2cTaxable.toFixed(2)} | Tax: ₹${gstReportSummary.b2cTax.toFixed(2)}
• Exports / Zero-Rated (LUT): ${gstReportSummary.exportCount} invoices | Value: ₹${gstReportSummary.exportTaxable.toFixed(2)}
--------------------------------------------------`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedGstSummary(true);
      setTimeout(() => setCopiedGstSummary(false), 2500);
    }
  };

  const exportGstReportCsv = () => {
    if (monthlyTaxInvoices.length === 0) {
      alert('No tax invoices found for this month to export.');
      return;
    }
    const headers = [
      'Invoice Number',
      'Invoice Date',
      'Client Name',
      'GSTIN of Recipient',
      'GSTR-1 Category',
      'Place of Supply',
      'Supply Type',
      'Tax Rate (%)',
      'Taxable Value (INR)',
      'Integrated Tax / IGST (INR)',
      'Central Tax / CGST (INR)',
      'State Tax / SGST (INR)',
      'Total Invoice Value (INR)',
      'Invoice Status'
    ];

    const rows = monthlyTaxInvoices.map(inv => [
      `"${inv.invoiceNumber}"`,
      `"${inv.issueDate}"`,
      `"${(inv.clientName || '').replace(/"/g, '""')}"`,
      `"${inv.clientGst || ''}"`,
      `"${inv.isLut ? 'Export / LUT' : inv.isB2B ? 'B2B Regular' : 'B2C Others'}"`,
      `"${(inv.placeOfSupply || '').replace(/"/g, '""')}"`,
      `"${inv.isBihar ? 'Intra-State' : 'Inter-State'}"`,
      inv.gstRate,
      inv.subtotal.toFixed(2),
      inv.igst.toFixed(2),
      inv.cgst.toFixed(2),
      inv.sgst.toFixed(2),
      inv.total.toFixed(2),
      `"${inv.status}"`
    ]);

    rows.push([
      '"TOTAL"',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      gstReportSummary.totalTaxable.toFixed(2),
      gstReportSummary.totalIgst.toFixed(2),
      gstReportSummary.totalCgst.toFixed(2),
      gstReportSummary.totalSgst.toFixed(2),
      gstReportSummary.totalGross.toFixed(2),
      '""'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GST_Report_${selectedReportMonthName}_${selectedReportYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const monthDropdownOptions = useMemo(() => [
    { value: 'all', label: 'All Months' },
    ...MONTH_NAMES.map((name, idx) => {
      const count = invoices.filter(inv => {
        const parts = (inv.issueDate || inv.dueDate || '').split('-');
        return parseInt(parts[1] || '0', 10) === idx + 1;
      }).length;
      return {
        value: String(idx),
        label: name,
        count: count > 0 ? count : undefined,
      };
    })
  ], [invoices]);

  const categoryDropdownOptions = [
    { value: 'all', label: 'All Categories' },
    { value: 'Domestic Business', label: 'Domestic Business' },
    { value: 'Domestic Individual', label: 'Domestic Individual' },
    { value: 'International Business', label: 'International Business' },
    { value: 'International Individual', label: 'International Individual' },
  ];

  const gstTreatmentDropdownOptions = [
    { value: 'all', label: 'All GST Treatments' },
    { value: 'gst_applicable', label: 'GST Applicable' },
    { value: 'lut_export', label: 'LUT Export' },
  ];

  const paymentSourceDropdownOptions = [
    { value: 'all', label: 'All Payment Sources' },
    { value: 'indian_bank', label: 'Indian Bank' },
    { value: 'foreign_remittance', label: 'Foreign Remittance' },
  ];

  const sortDropdownOptions = [
    { value: 'number-desc', label: 'Sort: Inv # (High)' },
    { value: 'number-asc', label: 'Sort: Inv # (Low)' },
    { value: 'date-desc', label: 'Sort: Date (New)' },
    { value: 'date-asc', label: 'Sort: Date (Old)' },
    { value: 'amount-desc', label: 'Sort: Amount (High)' },
    { value: 'amount-asc', label: 'Sort: Amount (Low)' },
  ];

  return (
    <div className="p-2 sm:p-4 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto h-[calc(100vh-4rem)] flex flex-col overflow-hidden text-slate-800 dark:text-slate-200">
      <Suspense fallback={null}>
        <InvoicesUrlListener onParams={setUrlQuery} />
      </Suspense>
      
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 relative ${showSyncDropdown ? 'z-[45]' : 'z-auto'}`}>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-gray-950 dark:text-gray-100" />
              Invoices & Receivables
            </h1>
            <span className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full">
              Business Income
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Generate client tax invoices, proforma estimates, track collections, and manage incoming revenue.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isReadOnly && (
            <>
              {/* Open Google Sheet Button */}
              <a
                href={sheetConfig.sheetUrl || 'https://docs.google.com/spreadsheets/d/1a0Xaf42WlDlA4tt4emgEp7ECpknC4a7pBfmtgJjwMe0/edit'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl text-[10px] font-semibold uppercase tracking-wider transition-all shadow-sm shrink-0 cursor-pointer"
                title="Open Google Sheet in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <span>Open Sheet</span>
              </a>

              {/* Sync to Sheet Dropdown */}
              <div className={`relative ${showSyncDropdown ? 'z-50' : ''}`} ref={syncDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowSyncDropdown(!showSyncDropdown)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl text-[10px] font-semibold uppercase tracking-wider transition-all shadow-sm shrink-0 cursor-pointer"
                  title="Google Sheets & Excel Two-Way Sync"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Sync to Sheet</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>

                {showSyncDropdown && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/5 dark:ring-white/5 max-h-[calc(100vh-8rem)] overflow-y-auto">
                    <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span>Google Sheet Sync</span>
                      {sheetConfig.webhookUrl ? (
                        <span className="text-[8px] text-emerald-600 font-bold flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
                        </span>
                      ) : (
                        <span className="text-[8px] text-amber-500 font-bold">Not Configured</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openInvoiceSyncModal}
                      disabled={isSyncingAllInvoices}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col">
                        <span>Sync Invoices...</span>
                        <span className="text-[9px] text-slate-400 font-normal">
                          {isSyncingAllInvoices ? 'Syncing...' : `Choose & sync from ${invoices.length} invoices`}
                        </span>
                      </div>
                      {isSyncingAllInvoices ? (
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={openClientSyncModalFromInvoices}
                      disabled={isSyncingAllClients}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col">
                        <span>Sync Clients...</span>
                        <span className="text-[9px] text-slate-400 font-normal">
                          {isSyncingAllClients ? 'Syncing...' : `Choose & sync from ${clients.length} clients`}
                        </span>
                      </div>
                      {isSyncingAllClients ? (
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>

                    {sheetConfig.sheetUrl && (
                      <a
                        href={sheetConfig.sheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div className="flex flex-col">
                          <span>Open Google Sheet</span>
                          <span className="text-[9px] text-slate-400 font-normal">View spreadsheet in new tab</span>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      </a>
                    )}

                    <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setShowSyncDropdown(false);
                        setSheetModalUrl(sheetConfig.sheetUrl || '');
                        setSheetModalWebhook(sheetConfig.webhookUrl || '');
                        setSheetTestResult(null);
                        setShowSheetModal(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Settings className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>Sheet Integration Settings</span>
                      </div>
                      {!isWorkspaceOwner ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center gap-1 shrink-0">
                          <Lock className="h-2.5 w-2.5" /> View Only
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                          Owner
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={openSettings}
                className="flex items-center gap-1.5 px-4.5 py-2.5 border border-slate-205 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-350 rounded-2xl text-[10px] font-semibold uppercase tracking-wider transition-all shadow-sm shrink-0"
              >
                <Settings className="h-4 w-4" /> Business Profile
              </button>
              <button
                onClick={() => openLogInvoice(activeDocTypeTab)}
                className="flex items-center gap-1.5 px-4.5 py-2.5 bg-slate-900 dark:bg-slate-100 hover:opacity-90 text-white dark:text-slate-900 rounded-2xl text-[10px] font-semibold uppercase tracking-wider shadow-sm transition-all shrink-0"
              >
                <Plus className="h-4 w-4" /> {activeDocTypeTab === 'proforma' ? 'Create Proforma' : activeDocTypeTab === 'receipt' ? 'Create Receipt' : 'Create Invoice'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast Feedback banner */}
      {sheetSyncFeedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200 animate-in fade-in duration-150 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">{sheetSyncFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setSheetSyncFeedback(null)}
            className="text-emerald-500 hover:text-emerald-700 p-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 shrink-0">
        {[
          {
            label: scopeLabelSuffix ? `Total (${scopeLabelSuffix})` : 'Total Billed',
            value: `₹${totalBilled.toLocaleString()}`,
            icon: <DollarSign className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />,
            color: 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400',
            sub: scopeLabelSuffix ? `${scopedInvoices.length} invs` : undefined
          },
          {
            label: scopeLabelSuffix ? `Collected (${scopeLabelSuffix})` : 'Collected Revenue',
            value: `₹${totalCollected.toLocaleString()}`,
            icon: <CheckCircle2 className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />,
            color: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400',
            sub: scopeLabelSuffix ? `${paidInvoices.length} paid` : undefined
          },
          {
            label: scopeLabelSuffix ? `Pending (${scopeLabelSuffix})` : 'Pending Bills',
            value: pendingInvoices.length.toString(),
            icon: <Clock className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" />,
            color: 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400',
            sub: scopeLabelSuffix ? `${pendingInvoices.length} awaiting` : undefined
          },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 p-2 sm:p-5 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-4 shadow-sm last:col-span-2 sm:last:col-span-1">
            <div className={`h-6 w-6 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${c.color}`}>{c.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[8px] sm:text-[9px] font-semibold text-slate-450 uppercase tracking-wider truncate">{c.label}</p>
                {c.sub && <span className="text-[8px] sm:text-[9px] font-semibold text-slate-400 shrink-0">{c.sub}</span>}
              </div>
              <p className="text-xs sm:text-base font-semibold mt-0.5 truncate">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Invoice List */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm flex flex-col min-h-0 relative">
        <div className="px-2.5 sm:px-4 py-1.5 sm:py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center shrink-0 rounded-t-2xl relative z-30">
          <div className="flex items-center gap-1.5 flex-wrap w-full py-0.5">
            {/* Tag & Client Hierarchical Selector */}
            <div className={`relative tag-client-dropdown-container shrink-0 ${showTagClientDropdown ? 'z-50' : 'z-10'}`}>
              <button
                type="button"
                onClick={() => setShowTagClientDropdown(prev => !prev)}
                className={`text-[9px] font-semibold border rounded-lg px-2.5 py-1 focus:outline-none cursor-pointer shrink-0 flex items-center gap-1.5 transition-all ${
                  filterClientId !== 'all' || filterTag !== 'all'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800 shadow-2xs font-bold'
                    : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-350 border-slate-205 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
                title="Filter by collection tag or specific client"
              >
                {filterTag !== 'all' ? (
                  <span className="text-[11px] leading-none">{getTagIcon(filterTag)}</span>
                ) : (
                  <Tag className="h-3 w-3 text-slate-400" />
                )}
                <span className="truncate max-w-[150px]">
                  {filterClientId !== 'all'
                    ? (selectedClient?.companyName || 'Client')
                    : filterTag !== 'all'
                    ? filterTag
                    : 'All Clients'}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400 shrink-0 ml-0.5" />
              </button>

              {showTagClientDropdown && (
                <div className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100">
                  
                  {/* Top: Collections & Tags Row */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Collections & Tags
                      </span>
                      {(filterTag !== 'all' || filterClientId !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setFilterTag('all');
                            setFilterClientId('all');
                          }}
                          className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Tags Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* All Clients Pill */}
                      <button
                        type="button"
                        onClick={() => {
                          setFilterTag('all');
                          setFilterClientId('all');
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                          filterTag === 'all'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 border-slate-200/80 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700/70'
                        }`}
                      >
                        <Tag className="h-3 w-3" />
                        <span>All Clients</span>
                        <span className={`text-[9px] px-1 rounded-full ${filterTag === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                          {clients.length}
                        </span>
                      </button>

                      {/* Each Custom Tag Pill */}
                      {allTagsWithClients.map(group => {
                        const isTagSelected = filterTag === group.tag;
                        return (
                          <button
                            key={group.tag}
                            type="button"
                            onClick={() => {
                              setFilterTag(group.tag);
                              setFilterClientId('all');
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                              isTagSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 border-slate-205 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700/70'
                            }`}
                          >
                            <span className="text-[11px]">{getTagIcon(group.tag)}</span>
                            <span>{group.tag}</span>
                            <span className={`text-[9px] px-1 rounded-full ${isTagSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                              {group.clients.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                  {/* Search box */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder={filterTag === 'all' ? 'Search all clients...' : `Search in ${filterTag}...`}
                      value={tagClientSearch}
                      onChange={e => setTagClientSearch(e.target.value)}
                      className="w-full pl-7 pr-6 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] focus:outline-none"
                    />
                    {tagClientSearch && (
                      <button
                        type="button"
                        onClick={() => setTagClientSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Clients list for current active tag (NO OTHER TAGS SHOWN) */}
                  <div className="space-y-0.5 max-h-56 overflow-y-auto no-scrollbar pt-1">
                    {/* Option to select All in this tag */}
                    <button
                      type="button"
                      onClick={() => {
                        setFilterClientId('all');
                        setShowTagClientDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        filterClientId === 'all'
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate">
                        {filterTag === 'all'
                          ? `All Clients (${clients.length})`
                          : `All in ${filterTag} (${currentTagClients.length})`}
                      </span>
                      {filterClientId === 'all' && (
                        <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      )}
                    </button>

                    <div className="border-t border-slate-100 dark:border-slate-800/80 my-1" />

                    {/* Dedicated client list for this tag */}
                    {displayClients.length === 0 ? (
                      <div className="py-4 text-center text-[10px] text-slate-400">
                        {tagClientSearch
                          ? 'No matching clients found'
                          : `No clients under ${filterTag}`}
                      </div>
                    ) : (
                      displayClients.map(client => {
                        const isClientSelected = filterClientId === client.id;
                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => {
                              setFilterClientId(client.id);
                              setShowTagClientDropdown(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                              isClientSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate">{client.companyName}</span>
                            {isClientSelected && (
                              <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <CustomDropdown
              value={filterMonth}
              onChange={val => setFilterMonth(val)}
              options={monthDropdownOptions}
              title="Filter by Month"
            />

            <CustomDropdown
              value={filterCategory}
              onChange={val => setFilterCategory(val as any)}
              options={categoryDropdownOptions}
              title="Filter by Category"
            />

            <CustomDropdown
              value={filterGstTreatment}
              onChange={val => setFilterGstTreatment(val as any)}
              options={gstTreatmentDropdownOptions}
              title="Filter by GST Treatment"
            />

            <CustomDropdown
              value={filterPaymentSource}
              onChange={val => setFilterPaymentSource(val as any)}
              options={paymentSourceDropdownOptions}
              title="Filter by Payment Source"
            />

            <CustomDropdown
              value={sortInvoicesBy}
              onChange={val => setSortInvoicesBy(val as InvoiceSortOption)}
              options={sortDropdownOptions}
              prefix={<ArrowUpDown className="h-3 w-3 text-slate-400 shrink-0" />}
              title="Sort Invoices"
              align="right"
            />

            <button
              type="button"
              onClick={() => setShowGstReport(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all cursor-pointer shrink-0 border bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-205 dark:border-slate-800 hover:border-blue-500 hover:text-blue-600"
              title="Open Monthly Tax Invoice & GST Filing Report Popup"
            >
              <FileSpreadsheet className="h-3 w-3 text-blue-500" />
              <span>Report</span>
              <span className="px-1 py-0.2 rounded text-[8px] font-black bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                GST
              </span>
            </button>
          </div>
        </div>

        {/* Document Type Tabs: Tax Invoice | Proforma | Receipt */}
        <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
            {([
              { id: 'invoice' as const, label: 'Tax Invoices', count: docTypeCounts.tax, activeBg: 'bg-blue-600', activeText: 'text-white' },
              { id: 'proforma' as const, label: 'Proforma Invoices', count: docTypeCounts.proforma, activeBg: 'bg-amber-600', activeText: 'text-white' },
              { id: 'receipt' as const, label: 'Payment Receipts', count: docTypeCounts.receipt, activeBg: 'bg-purple-600', activeText: 'text-white' },
            ]).map(tab => {
              const isActive = activeDocTypeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDocTypeTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer select-none shrink-0 ${
                    isActive
                      ? `${tab.activeBg} ${tab.activeText} shadow-xs`
                      : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-205 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-black min-w-[16px] text-center ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : tab.count > 0
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        : 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowGstReport(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border bg-white dark:bg-slate-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60 hover:bg-blue-50 dark:hover:bg-blue-950/50 shadow-xs"
              title="Open Monthly Tax Invoice & GST Filing Report Popup"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Report</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-black bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                {selectedReportMonthName.slice(0, 3)}
              </span>
            </button>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
              Showing {filteredInvoices.length} {activeDocTypeTab === 'proforma' ? 'proforma' : activeDocTypeTab === 'receipt' ? 'receipt' : 'tax invoice'}{filteredInvoices.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
            <FileSpreadsheet className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-xs font-semibold">
              No {activeDocTypeTab === 'proforma' ? 'proforma invoices' : activeDocTypeTab === 'receipt' ? 'payment receipts' : 'tax invoices'} match selected filters
            </p>
            {(filterClientId !== 'all' || filterTag !== 'all' || filterMonth !== 'all') && (
              <div className="flex items-center gap-2 mt-2">
                {filterTag !== 'all' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterTag('all');
                      setFilterClientId('all');
                    }}
                    className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Clear tag ({filterTag})
                  </button>
                )}
                {filterTag !== 'all' && (filterClientId !== 'all' || filterMonth !== 'all') && <span className="text-slate-300">·</span>}
                {filterClientId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFilterClientId('all')}
                    className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Clear client ({selectedClient?.companyName})
                  </button>
                )}
                {filterClientId !== 'all' && filterMonth !== 'all' && <span className="text-slate-300">·</span>}
                {filterMonth !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFilterMonth('all')}
                    className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Clear month ({selectedMonthName})
                  </button>
                )}
              </div>
            )}
            <p className="text-[10px] mt-1">
              Adjust filters or click Create to generate a {activeDocTypeTab === 'proforma' ? 'proforma document' : activeDocTypeTab === 'receipt' ? 'receipt' : 'tax invoice'}.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-b-2xl">
            {groupedInvoices.map(group => (
              <div key={group.monthKey} className="border-b border-slate-100 dark:border-slate-800/80 last:border-b-0">
                {/* Month Group Header */}
                <div className="sticky top-0 z-10 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-100/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-500" />
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      {group.monthName} {group.year}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[8px] sm:text-[9px] font-semibold bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {group.invoices.length} {activeDocTypeTab === 'proforma' ? (group.invoices.length === 1 ? 'proforma' : 'proformas') : activeDocTypeTab === 'receipt' ? (group.invoices.length === 1 ? 'receipt' : 'receipts') : (group.invoices.length === 1 ? 'inv' : 'invs')}
                    </span>
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Total: <span className="font-bold text-slate-800 dark:text-slate-200">₹{group.total.toLocaleString()}</span>
                  </div>
                </div>

                {/* Group Invoices */}
                <div className="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                  {group.invoices.map(inv => {
                    const s = STATUS_MAP[inv.status] || STATUS_MAP.draft;
                    const invDocType = getDocTypeFromInvoice(inv);
                    return (
                      <div
                        key={inv.id}
                        onClick={() => setSelectedInvoice(inv)}
                        className="flex items-center justify-between p-2.5 sm:p-4 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 cursor-pointer transition-all group gap-2"
                      >
                        {/* Left: Invoice ID, Status & Client (on mobile) */}
                        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                          <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center shrink-0 ${s.bgClass} ${s.textClass}`}>
                            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{inv.invoiceNumber}</span>
                              {invDocType === 'proforma' ? (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/80">Proforma</span>
                              ) : invDocType === 'receipt' ? (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border border-purple-200/80 dark:border-purple-800/80">Receipt</span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/80">Tax Invoice</span>
                              )}
                              <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider ${s.bgClass} ${s.textClass}`}>{s.label}</span>
                            </div>
                            {/* Client Name under invoice number on mobile to avoid row collision */}
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5 md:hidden">
                              {inv.clientName || '—'}
                            </p>
                          </div>
                        </div>

                        {/* Center: Client Name (hidden on mobile to prevent collision with total) */}
                        <div className="hidden md:flex flex-1 flex-col items-center justify-center px-4 min-w-0 text-center">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Client</p>
                          <p className="text-xs font-bold text-slate-750 dark:text-slate-200 truncate max-w-xs md:max-w-md">
                            {inv.clientName || '—'}
                          </p>
                        </div>

                        {/* Right: Due Date, Total Amount & Sync Button */}
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{invDocType === 'receipt' ? 'Payment Date' : invDocType === 'proforma' ? 'Valid Till' : 'Due Date'}</p>
                            <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{inv.dueDate}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider hidden sm:block">{invDocType === 'receipt' ? 'Received' : 'Total'}</p>
                            <p className="text-xs sm:text-sm font-black text-slate-850 dark:text-white">{getCurrencySymbol(inv.currency || 'INR')}{inv.total.toLocaleString()}</p>
                            <p className="text-[9px] text-slate-400 sm:hidden">{inv.dueDate}</p>
                          </div>

                          {/* Individual Sync to Sheet Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncSingleInvoice(inv);
                            }}
                            disabled={syncingInvoiceId === inv.id}
                            className={`p-1 sm:p-1.5 rounded-lg sm:rounded-xl border transition-all cursor-pointer ${
                              sheetConfig.syncedInvoiceIds?.includes(inv.id)
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 border-amber-200/90 dark:border-amber-800/90 hover:bg-amber-100 shadow-2xs'
                            }`}
                            title={
                              sheetConfig.syncedInvoiceIds?.includes(inv.id)
                                ? 'Synced with Google Sheet. Click to re-sync updated figures'
                                : 'Not synced with Google Sheet — click to sync now'
                            }
                          >
                            {syncingInvoiceId === inv.id ? (
                              <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin text-indigo-600" />
                            ) : sheetConfig.syncedInvoiceIds?.includes(inv.id) ? (
                              <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-600" />
                            ) : (
                              <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-600 dark:text-amber-400" />
                            )}
                          </button>

                          <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-300 group-hover:text-slate-500 transition-all animate-fade-in" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE INVOICE MODAL (EXPANDED BUILDER) */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-955/80 backdrop-blur-sm overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddModal(false); setEditingInvoice(null); } }}
        >
          <div className="w-full max-w-4xl h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="h-4.5 w-4.5 text-indigo-650" />
                  {editingInvoice ? 'Edit Invoice' : 'Invoice & Receipt Generator'}
                </h3>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">
                  {editingInvoice
                    ? `Editing ${editingInvoice.invoiceNumber} — all changes will be saved permanently.`
                    : 'Build tax invoices, items tables, discounts, and GST taxes.'}
                </p>
              </div>
              <button onClick={() => { setShowAddModal(false); setEditingInvoice(null); }} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitInvoice} className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto">
              
              {/* Left Pane: Config & Client Details */}
              <div className="w-full md:w-1/2 p-6 border-r border-slate-100 dark:border-slate-800 space-y-4 overflow-y-auto">
                <div className="space-y-3.5">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Document Settings</h4>
                  
                  {/* Type Tabs */}
                  <div className="flex gap-2">
                    {(['invoice', 'proforma', 'receipt'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setDocType(type);
                          const yy = (issueDate ? issueDate.split('-')[0].slice(-2) : new Date().getFullYear().toString().slice(-2));
                          const isAutoPattern = !invoiceNumber || /^(DOC|PRO|REC|INV)-/i.test(invoiceNumber);
                          if (isAutoPattern) {
                            setInvoiceNumber(getNextDocNumber(type, invoices, yy));
                          }
                        }}
                        className={`flex-1 py-2 border rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                          docType === type 
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm'
                            : 'border-slate-200 dark:border-slate-805 text-slate-500'
                        }`}
                      >
                        {type === 'invoice' ? 'Tax Invoice' : type === 'proforma' ? 'Proforma Invoice' : 'Receipt'}
                      </button>
                    ))}
                  </div>

                  {/* Template selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Template Style</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['classic', 'modern', 'compact'] as const).map(style => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setTpl(style)}
                          className={`py-2 px-1 border rounded-xl text-[9px] font-bold uppercase tracking-wider text-center transition-all ${
                            tpl === style
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400'
                              : 'border-slate-200 dark:border-slate-805 text-slate-500'
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Document details</h4>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 mb-1">Doc Number</label>
                      <input
                        required
                        type="text"
                        value={invoiceNumber}
                        onChange={e => {
                          const val = e.target.value;
                          setInvoiceNumber(val);
                          const upper = val.trim().toUpperCase();
                          if (upper.startsWith('PRO-')) setDocType('proforma');
                          else if (upper.startsWith('REC-')) setDocType('receipt');
                          else if (upper.startsWith('DOC-')) setDocType('invoice');
                        }}
                        placeholder={docType === 'invoice' ? 'e.g. DOC-26-1030' : docType === 'proforma' ? 'e.g. PRO-26-1020' : 'e.g. REC-26-1125'}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 mb-1">Issue Date</label>
                      <input
                        required
                        type="date"
                        value={issueDate}
                        onChange={e => {
                          const val = e.target.value;
                          setIssueDate(val);
                          if (!editingInvoice) {
                            const match = invoiceNumber.match(/^(DOC|PRO|REC)-(\d{2})-(\d+)$/i);
                            if (match) {
                              const oldYy = match[2];
                              const newYy = val.split('-')[0]?.slice(-2);
                              if (newYy && newYy !== oldYy) {
                                setInvoiceNumber(getNextDocNumber(docType, invoices, newYy));
                              }
                            }
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 mb-1">Due Date</label>
                      <input required type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Place of Supply</label>
                    <select value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none">
                      <option value="">Select State</option>
                      {INDIAN_STATES.map(s => (
                        <option key={s.code} value={`${s.name} (${s.code})`}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Billed to (client)</h4>
                  
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Select Client Profile *</label>
                    <div className="relative modal-client-dropdown-container">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowModalClientDropdown(prev => !prev)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowModalClientDropdown(prev => !prev);
                          }
                        }}
                        className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer text-left select-none ${
                          clientId
                            ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20'
                            : 'border-slate-205 dark:border-slate-805 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {clientId ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                {eligibleClients.find(c => c.id === clientId)?.companyName || clientName || 'Selected Client'}
                              </span>
                              {eligibleClients.find(c => c.id === clientId)?.tags?.[0] && (
                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                                  {eligibleClients.find(c => c.id === clientId)?.tags?.[0]}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">
                              {eligibleClients.length === 0 ? 'No clients available...' : 'Choose an existing client...'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {clientId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClientSelect('');
                              }}
                              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                              title="Clear selected client"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showModalClientDropdown ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      {/* Popover */}
                      {showModalClientDropdown && (
                        <div className="absolute left-0 top-full mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100">
                          
                          {/* Collections & Tags Row */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between px-0.5">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Collections & Tags
                              </span>
                              {modalTagFilter !== 'all' && (
                                <button
                                  type="button"
                                  onClick={() => setModalTagFilter('all')}
                                  className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                >
                                  Reset
                                </button>
                              )}
                            </div>

                            {/* Tags Pills */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* All Clients Pill */}
                              <button
                                type="button"
                                onClick={() => setModalTagFilter('all')}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                                  modalTagFilter === 'all'
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 border-slate-200/80 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700/70'
                                }`}
                              >
                                <Tag className="h-3 w-3" />
                                <span>All Clients</span>
                                <span className={`text-[9px] px-1 rounded-full ${modalTagFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                                  {eligibleClients.length}
                                </span>
                              </button>

                              {/* Each Custom Tag Pill */}
                              {modalTagsWithClients.map(group => {
                                const isTagSelected = modalTagFilter === group.tag;
                                return (
                                  <button
                                    key={group.tag}
                                    type="button"
                                    onClick={() => setModalTagFilter(group.tag)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                                      isTagSelected
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 border-slate-205 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700/70'
                                    }`}
                                  >
                                    <span className="text-[11px]">{getTagIcon(group.tag)}</span>
                                    <span>{group.tag}</span>
                                    <span className={`text-[9px] px-1 rounded-full ${isTagSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                                      {group.clients.length}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                          {/* Search box */}
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              placeholder={modalTagFilter === 'all' ? 'Search all clients...' : `Search in ${modalTagFilter}...`}
                              value={modalClientSearch}
                              onChange={e => setModalClientSearch(e.target.value)}
                              className="w-full pl-7 pr-6 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] focus:outline-none"
                            />
                            {modalClientSearch && (
                              <button
                                type="button"
                                onClick={() => setModalClientSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                              >
                                ×
                              </button>
                            )}
                          </div>

                          {/* Dedicated Client List for Active Tag */}
                          <div className="space-y-0.5 max-h-52 overflow-y-auto no-scrollbar pt-1">
                            {displayModalClients.length === 0 ? (
                              <div className="py-4 text-center text-[10px] text-slate-400">
                                {modalClientSearch ? 'No matching clients found' : `No clients under ${modalTagFilter}`}
                              </div>
                            ) : (
                              displayModalClients.map(client => {
                                const isSelected = clientId === client.id;
                                return (
                                  <button
                                    key={client.id}
                                    type="button"
                                    onClick={() => {
                                      handleClientSelect(client.id);
                                      setShowModalClientDropdown(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-bold'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="truncate">{client.companyName}</span>
                                      {modalTagFilter === 'all' && client.tags && client.tags.length > 0 && (
                                        <span className="px-1.5 py-0.2 rounded text-[8px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                                          {client.tags[0]}
                                        </span>
                                      )}
                                    </div>
                                    {isSelected && (
                                      <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {clientId && (
                    <div className="space-y-3 p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/30 rounded-2xl">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[8px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Payment Source</label>
                          <select value={paymentSource} onChange={e => setPaymentSource(e.target.value as any)}
                            className="w-full text-[10px] bg-white dark:bg-slate-900 border border-indigo-200/50 dark:border-slate-800 rounded-lg py-1 px-1.5 focus:outline-none">
                            <option value="indian_bank">Indian Bank Account</option>
                            <option value="foreign_remittance">Foreign Remittance</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Invoice Currency</label>
                          <select value={invoiceCurrency} onChange={e => setInvoiceCurrency(e.target.value)}
                            className="w-full text-[10px] bg-white dark:bg-slate-900 border border-indigo-200/50 dark:border-slate-800 rounded-lg py-1 px-1.5 focus:outline-none">
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
                        <label className="block text-[8px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">GST Treatment Override</label>
                        <select value={gstTreatmentOverride} onChange={e => setGstTreatmentOverride(e.target.value as any)}
                          className="w-full text-[10px] bg-white dark:bg-slate-900 border border-indigo-200/50 dark:border-slate-800 rounded-lg py-1 px-1.5 focus:outline-none">
                          <option value="none">Auto-Calculate (Recommended)</option>
                          <option value="gst_applicable">GST Applicable (Force 18%)</option>
                          <option value="lut_export">LUT Export (Force 0% GST)</option>
                        </select>
                      </div>

                      {/* Engine Live calculations Display */}
                      <div className="pt-2 border-t border-indigo-100/50 dark:border-indigo-900/30 text-[10px] space-y-1 bg-white/40 dark:bg-black/20 p-2.5 rounded-xl">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Resolved Category</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{classifyClientCategory(clientLocation, clientType)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">GST Treatment</span>
                          <span className="font-bold text-indigo-650 dark:text-indigo-400">
                            {totals.resolvedGst === 'lut_export' ? 'LUT / Export of Services (No GST)' : 'GST Applicable'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-450">GST Percentage</span>
                          <span className="font-black text-slate-800 dark:text-slate-100">{totals.activeGstRate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-450">Invoice Type</span>
                          <span className="font-black text-slate-800 dark:text-slate-100">
                            {docType === 'proforma' ? 'Proforma Invoice' : docType === 'receipt' ? 'Receipt' : 'Tax Invoice'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 mb-1">Client GSTIN</label>
                      <input type="text" placeholder="e.g. 06AAJCB9667N1ZU" value={clientGst} onChange={e => setClientGst(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 mb-1">Phone</label>
                      <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Address Details</label>
                    <textarea value={clientAddress} onChange={e => setClientAddress(e.target.value)} rows={2} placeholder="Street, State, PIN"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none resize-none" />
                  </div>
                </div>
              </div>

              {/* Right Pane: Line items & totals */}
              <div className="w-full md:w-1/2 p-6 flex flex-col min-h-0 bg-slate-50/30 dark:bg-slate-950/20 overflow-y-auto">
                <div className="space-y-4 flex-1">
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Line Items</h4>
                      <button type="button" onClick={addLineItem} className="text-[9px] font-bold text-indigo-650 dark:text-indigo-400 hover:underline cursor-pointer">+ Add Row</button>
                    </div>

                    {/* Column Headers */}
                    <div className="flex gap-2 items-center px-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="w-4 text-center">#</span>
                      <span className="flex-1">Description</span>
                      <span className="w-14 text-center">Qty</span>
                      <span className="w-24 text-right">Price</span>
                      <span className="w-6"></span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {lineItems.map((item, index) => (
                        <div key={item.id} className="flex gap-2 items-center bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805/50 p-2.5 rounded-xl">
                          <span className="text-[10px] text-slate-400 font-bold w-4 text-center">{index + 1}</span>
                          <input required type="text" placeholder="Service description" value={item.desc} onChange={e => updateLineItem(item.id, { desc: e.target.value })}
                            className="flex-1 min-w-0 bg-transparent text-xs outline-none border-b border-transparent focus:border-slate-300 dark:focus:border-slate-700" />
                          <input
                            required
                            type="number"
                            min="1"
                            value={item.qty === 0 ? '' : item.qty}
                            onChange={e => updateLineItem(item.id, { qty: e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 1 })}
                            onBlur={() => {
                              if (!item.qty || item.qty < 1) updateLineItem(item.id, { qty: 1 });
                            }}
                            placeholder="1"
                            title="Quantity"
                            className="w-14 text-center bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 py-1.5 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:border-indigo-500"
                          />
                          <input
                            required
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.rate || ''}
                            onChange={e => updateLineItem(item.id, { rate: Number(e.target.value) || 0 })}
                            title="Unit Price"
                            className="w-24 text-right bg-slate-50 dark:bg-slate-955 border border-slate-205 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 py-1.5 px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:border-indigo-500"
                          />
                          
                          <button type="button" disabled={lineItems.length === 1} onClick={() => removeLineItem(item.id)}
                            className="p-1 text-slate-350 hover:text-rose-500 rounded disabled:opacity-30 w-6 flex items-center justify-center cursor-pointer">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* GST settings */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-805/60">
                    <div>
                      <label className="block text-[8px] font-bold text-slate-450 uppercase mb-1">GST Rate</label>
                      <select value={gstRate} onChange={e => setGstRate(Number(e.target.value))}
                        className="w-full text-[10px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-1 px-1">
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold text-slate-455 uppercase mb-1">GST Type</label>
                      <select value={gstType} onChange={e => setGstType(e.target.value as 'igst' | 'cgst')}
                        className="w-full text-[10px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-1 px-1">
                        <option value="igst">IGST</option>
                        <option value="cgst">CGST+SGST</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[8px] font-bold text-slate-450 uppercase mb-1">Discount %</label>
                      <input type="number" min="0" max="100" value={discountPct} onChange={e => setDiscountPct(Number(e.target.value) || 0)}
                        className="w-full text-[10px] text-right bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-1 px-1.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1 shrink-0">
                        <input
                          type="checkbox"
                          id="requireAdvance"
                          checked={requireAdvance}
                          onChange={e => {
                            setRequireAdvance(e.target.checked);
                            if (!e.target.checked) setAdvancePct(0);
                            else setAdvancePct(20);
                          }}
                          className="rounded text-indigo-650 focus:ring-indigo-500 h-3 w-3 cursor-pointer"
                        />
                        <label htmlFor="requireAdvance" className="block text-[8px] font-bold text-slate-450 uppercase cursor-pointer select-none leading-none">
                          Advance %
                        </label>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={!requireAdvance}
                        value={advancePct}
                        onChange={e => setAdvancePct(Number(e.target.value) || 0)}
                        className="w-full text-[10px] text-right bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-1 px-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Notes text */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[9px] font-bold text-slate-500">Invoice Notes (footer)</label>
                      <select
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'standard') setNotesText('We appreciate the opportunity to work with you!');
                          else if (val === 'terms') setNotesText('Payment is due within 15 days of invoice date. Late payments are subject to late fees.');
                          else if (val === 'milestone') setNotesText('Payment terms: 20% advance to start, balance upon delivery.');
                          else if (val === 'custom') setNotesText('');
                        }}
                        className="text-[9px] bg-slate-55 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded py-0.5 px-1 focus:outline-none cursor-pointer text-slate-500 dark:text-slate-350"
                      >
                        <option value="standard">Standard Preset</option>
                        <option value="terms">Payment Terms Preset</option>
                        <option value="milestone">Milestones Preset</option>
                        <option value="custom">Clear / Custom Note</option>
                      </select>
                    </div>
                    <textarea value={notesText} onChange={e => setNotesText(e.target.value)} rows={2}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none resize-none" />
                  </div>

                  {/* Calculations breakdown list */}
                  <div className="pt-2 border-t border-slate-200/50 dark:border-slate-850 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Subtotal</span>
                      <span className="font-bold">{getCurrencySymbol(invoiceCurrency)}{totals.subtotal.toFixed(2)}</span>
                    </div>
                    {totals.discount > 0 && (
                       <div className="flex justify-between items-center text-xs text-rose-600">
                         <span>Discount ({discountPct}%)</span>
                         <span>-{getCurrencySymbol(invoiceCurrency)}{totals.discount.toFixed(2)}</span>
                       </div>
                    )}
                    {totals.taxTotal > 0 && (
                      gstType === 'igst' ? (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-450">IGST ({gstRate}%)</span>
                          <span>{getCurrencySymbol(invoiceCurrency)}{totals.taxTotal.toFixed(2)}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-450">CGST ({gstRate/2}%)</span>
                            <span>{getCurrencySymbol(invoiceCurrency)}{(totals.taxTotal/2).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-450">SGST ({gstRate/2}%)</span>
                            <span>{getCurrencySymbol(invoiceCurrency)}{(totals.taxTotal/2).toFixed(2)}</span>
                          </div>
                        </>
                      )
                    )}
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="font-bold">Total Payable</span>
                      <span className="font-black text-indigo-650 dark:text-indigo-400">{getCurrencySymbol(invoiceCurrency)}{totals.total.toFixed(2)}</span>
                    </div>
                    {totals.advance > 0 && (
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold bg-slate-100 dark:bg-slate-900/60 p-2 rounded-lg mt-2">
                        <span>Advance required ({advancePct}%)</span>
                        <span>{getCurrencySymbol(invoiceCurrency)}{totals.advance.toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Footer buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 bg-transparent shrink-0">
                  <button type="button" onClick={() => { setShowAddModal(false); setEditingInvoice(null); }} className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">Cancel</button>
                  <button type="submit" disabled={creating || clients.length === 0} className="px-5 py-2 bg-slate-900 hover:opacity-90 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5">
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {editingInvoice ? 'Save Changes' : 'Save Invoice'}
                  </button>
                </div>

              </div>

            </form>

          </div>
        </div>
      )}

      {/* INVOICE PREVIEW MODAL */}
      {selectedInvoice && (() => {
        const selDocType = getDocTypeFromInvoice(selectedInvoice);
        const selDocTitle = selDocType === 'proforma' ? 'Proforma Invoice' : selDocType === 'receipt' ? 'Receipt' : 'Tax Invoice';
        const selDocNumLabel = selDocType === 'proforma' ? 'Proforma Number' : selDocType === 'receipt' ? 'Receipt Number' : 'Invoice Number';

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-955/80 backdrop-blur-sm animate-fade-in overflow-hidden"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedInvoice(null); }}
          >
            <div className="w-full max-w-4xl h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
              
              {/* Preview Modal Header */}
              <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
                <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[140px] sm:max-w-none">{selDocTitle}</span>
                    <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${STATUS_MAP[selectedInvoice.status].bgClass} ${STATUS_MAP[selectedInvoice.status].textClass}`}>
                      {selectedInvoice.status}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Issued: {selectedInvoice.issueDate}</span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
                  {/* Copy for ChatGPT (Image) */}
                  <button
                    type="button"
                    onClick={() => handleCopyForAi(selectedInvoice)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer ${
                      copiedAi
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-indigo-500/20'
                    }`}
                    title="Copies prompt for ChatGPT to generate a high-resolution, beautiful visual image of this invoice"
                  >
                    {copiedAi ? (
                      <>
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">Copied Image Prompt!</span>
                        <span className="sm:hidden">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                        <span className="hidden sm:inline">Copy for ChatGPT (Image)</span>
                        <span className="sm:hidden">ChatGPT</span>
                      </>
                    )}
                  </button>

                  {/* Copy Raw JSON */}
                  <button
                    type="button"
                    onClick={() => handleCopyRawJson(selectedInvoice)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      copiedJson
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-205 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-350'
                    }`}
                    title="Copies raw invoice JSON data to clipboard"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="hidden sm:inline">Copied JSON!</span>
                        <span className="sm:hidden">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span className="hidden sm:inline">Copy Raw JSON</span>
                        <span className="sm:hidden">JSON</span>
                      </>
                    )}
                  </button>

                  {/* HTML download */}
                  <button
                    onClick={() => handleDownloadHtml(selectedInvoice)}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-slate-205 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-650 dark:text-slate-350 transition-all cursor-pointer"
                    title="Download static HTML file"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download HTML</span>
                    <span className="sm:hidden">HTML</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteInvoice(selectedInvoice.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-955/20 rounded-xl transition-all cursor-pointer"
                    title={`Delete ${selDocTitle}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  {/* Close */}
                  <button onClick={() => setSelectedInvoice(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer" aria-label="Close modal">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Mobile Tab Switcher (Visible on small screens, hidden on md+) */}
              <div className="md:hidden flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 p-1.5 gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewMobileTab('preview')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    previewMobileTab === 'preview'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Document Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMobileTab('details')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    previewMobileTab === 'details'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Details & Actions</span>
                </button>
              </div>

              <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
                
                {/* Left Column: Properties Dossier */}
                <div className={`${previewMobileTab === 'preview' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[18rem] p-4 sm:p-5 border-r border-slate-100 dark:border-slate-800 space-y-4 overflow-y-auto shrink-0 bg-slate-50/30 dark:bg-slate-950/10`}>
                  {/* Mobile Back-to-Preview Button */}
                  <div className="md:hidden pb-2 border-b border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewMobileTab('preview')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Back to Document Preview</span>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{selDocNumLabel}</p>
                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">{selectedInvoice.invoiceNumber}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Client Account</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{selectedInvoice.clientName}</p>
                  </div>

                  {/* Status Switcher Select */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Change Status</p>
                    <select
                      value={selectedInvoice.status}
                      onChange={e => handleUpdateStatus(selectedInvoice.id, e.target.value as Invoice['status'])}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-xl text-xs focus:outline-none"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="void">Void</option>
                    </select>
                  </div>

                  {/* Invoice Actions */}
                  <div className="space-y-2 pt-2 border-t border-slate-150/40 dark:border-slate-800/40">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Invoice Actions</p>
                    
                    {/* Print PDF Button */}
                    <button
                      type="button"
                      onClick={() => handlePrintPdf(selectedInvoice)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                      title="Print / Save PDF"
                    >
                      <Printer className="h-4 w-4 shrink-0" />
                      <span>Print PDF</span>
                    </button>

                    {/* Sync to Sheet Button */}
                    <button
                      type="button"
                      onClick={() => handleSyncSingleInvoice(selectedInvoice)}
                      disabled={syncingInvoiceId === selectedInvoice.id}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 border rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs ${
                        sheetConfig.syncedInvoiceIds?.includes(selectedInvoice.id)
                          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60'
                          : 'border-amber-300 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 ring-1 ring-amber-400/30'
                      }`}
                      title={
                        sheetConfig.syncedInvoiceIds?.includes(selectedInvoice.id)
                          ? 'Synced with Google Sheet. Click to re-sync updated figures'
                          : 'Not synced with Google Sheet! Click to sync this invoice now'
                      }
                    >
                      {syncingInvoiceId === selectedInvoice.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                          <span>Syncing...</span>
                        </>
                      ) : sheetConfig.syncedInvoiceIds?.includes(selectedInvoice.id) ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Synced</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
                          <span>Not Synced (Click to Sync)</span>
                        </>
                      )}
                    </button>

                    {/* Edit Invoice Button */}
                    <button
                      type="button"
                      onClick={() => { setSelectedInvoice(null); openEditInvoice(selectedInvoice); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                      title={`Edit ${selDocTitle}`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit Invoice</span>
                    </button>
                  </div>

                  {/* Totals card */}
                  <div className="p-4 bg-white dark:bg-slate-900 border border-slate-150/60 dark:border-slate-808 rounded-2xl shadow-inner space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-450 uppercase font-semibold">
                      <span>Grand Total</span>
                    </div>
                    <p className="font-mono text-base font-black text-indigo-650 dark:text-indigo-400">₹{selectedInvoice.total.toLocaleString()}</p>
                    <div className="text-[8px] text-slate-400 block pt-1 border-t border-slate-100 dark:border-slate-800">
                      Includes GST split adjustments.
                    </div>
                  </div>
                </div>

                {/* Right Column: Live rendered Document Preview (iframe) */}
                <div className={`${previewMobileTab === 'details' ? 'hidden md:flex' : 'flex'} flex-1 bg-slate-100 dark:bg-slate-950/40 p-2 sm:p-4 flex-col items-center min-h-0 relative overflow-hidden`}>
                  {/* Top bar on iframe container with Template style selector */}
                  <div className="w-full max-w-[680px] flex items-center justify-between gap-2 mb-2 px-1 shrink-0">
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                      {(['classic', 'modern', 'compact'] as const).map(style => (
                        <button
                          key={style}
                          onClick={() => setPreviewTpl(style)}
                          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wider capitalize transition-all cursor-pointer ${
                            previewTpl === style
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] sm:text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                        ₹{selectedInvoice.total.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Iframe preview container */}
                  <div className="w-full max-w-[680px] flex-1 bg-white border border-slate-205 dark:border-slate-850 rounded-2xl shadow-md overflow-hidden flex flex-col min-h-0">
                    <iframe
                      title="Invoice PDF Rendering Frame"
                      className="flex-1 w-full border-none h-full"
                      srcDoc={buildInvoiceHTML(selectedInvoice, previewTpl, false)}
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>
      );
    })()}

      {/* BUSINESS SETTINGS MODAL */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-955/80 backdrop-blur-sm animate-fade-in overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettingsModal(false); }}
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-805 rounded-3xl shadow-2xl p-6 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Settings className="h-4 w-4 text-indigo-650" /> Business Profile Settings
                </h3>
                <p className="text-[9px] text-slate-400 mt-0.5">Customize company name, address, tax IDs, and billing credentials displayed on invoices.</p>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1">Company Name *</label>
                  <input required type="text" value={bizName} onChange={e => setBizName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1">Tagline / Studio Type</label>
                  <input type="text" placeholder="Creative-tech studio" value={bizTagline} onChange={e => setBizTagline(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1">GSTIN</label>
                  <input type="text" placeholder="10CKTPC0886R1ZL" value={bizGstin} onChange={e => setBizGstin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1">LUT Authorization</label>
                  <input type="text" placeholder="LUT-2026-27/0034" value={bizLut} onChange={e => setBizLut(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 mb-1">Company Logo</label>
                <div className="flex items-center gap-3.5 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-2xl">
                  <div className="w-14 h-14 rounded-xl border border-slate-300 dark:border-slate-700 bg-white p-1 flex items-center justify-center shrink-0">
                    <img src={bizLogo || '/logo.png'} alt="Logo Preview" className="w-full h-full object-contain rounded-lg" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:opacity-90 shadow-sm transition-all">
                        <Upload className="h-3 w-3" /> Change Logo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 2 * 1024 * 1024) {
                                alert('Logo must be under 2MB');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = ev => {
                                setBizLogo(ev.target?.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      {bizLogo !== '/logo.png' && (
                        <button
                          type="button"
                          onClick={() => setBizLogo('/logo.png')}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Reset to default
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">Displays at the top-left of every invoice above the business name.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 mb-1">Registered Address *</label>
                <textarea required rows={2} value={bizAddr} onChange={e => setBizAddr(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none resize-none" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1">Phone *</label>
                  <input required type="text" value={bizPhone} onChange={e => setBizPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1">Email *</label>
                  <input required type="email" value={bizEmail} onChange={e => setBizEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 mb-1">Website URL</label>
                  <input type="text" placeholder="docdril.com" value={bizWeb} onChange={e => setBizWeb(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 mb-1">Banking Details (Account No, Bank Name, IFSC) *</label>
                <textarea required rows={3} value={bizBank} onChange={e => setBizBank(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none resize-none" />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 mb-1">UPI ID (Scan & Pay Target) *</label>
                <input required type="text" placeholder="e.g. merchant@okaxis" value={bizUpi} onChange={e => setBizUpi(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-xl text-xs focus:outline-none" />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 mb-1">UPI Payment QR Code (Optional)</label>
                <div className="flex items-center gap-3.5 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-805 rounded-2xl">
                  {bizQr ? (
                    <div className="relative group shrink-0">
                      <img src={bizQr} alt="QR Preview" className="w-14 h-14 object-contain rounded-xl border border-slate-300 dark:border-slate-700 bg-white p-1 shadow-xs" />
                      <button
                        type="button"
                        onClick={() => setBizQr('')}
                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 hover:bg-rose-600 shadow-sm cursor-pointer"
                        title="Remove QR code"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0 bg-white dark:bg-slate-900">
                      <QrCode className="h-6 w-6 opacity-50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isGeneratingQr || !bizUpi}
                        onClick={handleAutoGenerateQr}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all cursor-pointer disabled:opacity-50"
                        title="Generate a razor-sharp, 100% scannable high-resolution QR code directly from your UPI ID"
                      >
                        <QrCode className="h-3 w-3" /> {isGeneratingQr ? 'Generating...' : 'Auto-Generate Crisp QR'}
                      </button>
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:opacity-90 shadow-sm transition-all">
                        <Upload className="h-3 w-3" /> {bizQr ? 'Upload Other Image' : 'Upload QR Image'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 2 * 1024 * 1024) {
                                alert('QR image must be under 2MB');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = ev => {
                                setBizQr(ev.target?.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      {bizQr && (
                        <button
                          type="button"
                          onClick={() => setBizQr('')}
                          className="text-[10px] font-bold text-rose-500 hover:underline cursor-pointer ml-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1.5">
                      Click <b>Auto-Generate Crisp QR</b> to create a razor-sharp 450×450 scannable UPI QR from your UPI ID, or upload your PhonePe/Paytm QR image.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button type="button" onClick={() => setShowSettingsModal(false)} className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-all shadow-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE MULTI-SELECT SYNC MODAL */}
      {showInvoiceSyncModal && (
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
                    Select Invoices to Sync
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Choose which invoices to push to Google Sheet&apos;s <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-emerald-600 font-mono">Invoices</code> tab.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInvoiceSyncModal(false)}
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
                    checked={invoices.length > 0 && selectedInvoiceSyncIds.length === invoices.length}
                    onChange={toggleSelectAllSyncInvoices}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-600"
                  />
                  <span>Select All ({invoices.length})</span>
                </label>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                  {selectedInvoiceSyncIds.length} selected
                </span>
              </div>

              {/* Search filter in modal */}
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter invoices..."
                  value={invoiceSyncSearch}
                  onChange={e => setInvoiceSyncSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Scrollable Invoices List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 max-h-[46vh]">
              {invoices
                .filter(inv => {
                  if (!invoiceSyncSearch.trim()) return true;
                  const term = invoiceSyncSearch.toLowerCase();
                  return (
                    inv.invoiceNumber.toLowerCase().includes(term) ||
                    inv.clientName.toLowerCase().includes(term) ||
                    inv.status.toLowerCase().includes(term)
                  );
                })
                .sort((a, b) => compareInvoices(a, b, 'number-desc'))
                .map(inv => {
                  const isChecked = selectedInvoiceSyncIds.includes(inv.id);
                  const isAlreadySynced = sheetConfig.syncedInvoiceIds?.includes(inv.id);
                  return (
                    <div
                      key={inv.id}
                      onClick={() => toggleInvoiceSyncSelection(inv.id)}
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
                          onChange={() => toggleInvoiceSyncSelection(inv.id)}
                          onClick={e => e.stopPropagation()}
                          className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-600 shrink-0"
                        />
                        <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                          <ReceiptText className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                            <span>{inv.invoiceNumber}</span>
                            {isAlreadySynced && (
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 rounded font-semibold border border-emerald-200/50">
                                Synced
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate flex items-center gap-2">
                            <span>{inv.clientName}</span>
                            <span>• {inv.issueDate}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          ₹{Number(inv.total || 0).toLocaleString('en-IN')}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                          inv.status === 'paid'
                            ? 'bg-emerald-100/60 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                            : inv.status === 'sent'
                            ? 'bg-blue-100/60 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Reconciliation / Selective Notice */}
            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              {selectedInvoiceSyncIds.length === invoices.length && invoices.length > 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60">
                  <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Full Mirror Sync:</strong> All active invoices are selected. Any deleted or unlisted invoice rows in your Google Sheet will be automatically removed.
                  </span>
                </div>
              ) : selectedInvoiceSyncIds.length > 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-xl border border-blue-200/60 dark:border-blue-800/60">
                  <Info className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Selective Sync:</strong> Only the {selectedInvoiceSyncIds.length} selected invoice(s) will be updated or appended. Other existing rows in the sheet will remain untouched.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-955/40 p-2.5 rounded-xl border border-rose-200/60 dark:border-rose-800/60">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Please select at least 1 invoice to sync to your spreadsheet.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowInvoiceSyncModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSyncInvoices}
                disabled={selectedInvoiceSyncIds.length === 0 || isSyncingAllInvoices}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-emerald-600/20"
              >
                {isSyncingAllInvoices ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span>
                  {isSyncingAllInvoices
                    ? 'Syncing...'
                    : selectedInvoiceSyncIds.length === invoices.length
                    ? 'Confirm & Sync All Invoices'
                    : `Confirm & Sync ${selectedInvoiceSyncIds.length} Invoice${selectedInvoiceSyncIds.length > 1 ? 's' : ''}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLIENT MULTI-SELECT SYNC MODAL (FROM INVOICES PAGE) */}
      {showClientSyncModalFromInvoices && (
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
                onClick={() => setShowClientSyncModalFromInvoices(false)}
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
                    checked={clients.length > 0 && selectedClientSyncIdsFromInvoices.length === clients.length}
                    onChange={toggleSelectAllSyncClientsFromInvoices}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer accent-emerald-600"
                  />
                  <span>Select All ({clients.length})</span>
                </label>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                  {selectedClientSyncIdsFromInvoices.length} selected
                </span>
              </div>

              {/* Search filter in modal */}
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter clients..."
                  value={clientSyncSearchFromInvoices}
                  onChange={e => setClientSyncSearchFromInvoices(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Scrollable Client List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 max-h-[46vh]">
              {clients
                .filter(c => {
                  if (!clientSyncSearchFromInvoices.trim()) return true;
                  const term = clientSyncSearchFromInvoices.toLowerCase();
                  return (
                    c.companyName.toLowerCase().includes(term) ||
                    c.contactPerson.toLowerCase().includes(term) ||
                    c.email.toLowerCase().includes(term)
                  );
                })
                .map(cli => {
                  const isChecked = selectedClientSyncIdsFromInvoices.includes(cli.id);
                  return (
                    <div
                      key={cli.id}
                      onClick={() => toggleClientSyncSelectionFromInvoices(cli.id)}
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
                          onChange={() => toggleClientSyncSelectionFromInvoices(cli.id)}
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
              {selectedClientSyncIdsFromInvoices.length === clients.length && clients.length > 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60">
                  <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Full Mirror Sync:</strong> All active clients are selected. Unlisted or deleted clients in your Google Sheet will be automatically removed.
                  </span>
                </div>
              ) : selectedClientSyncIdsFromInvoices.length > 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-xl border border-blue-200/60 dark:border-blue-800/60">
                  <Info className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>Selective Sync:</strong> Only the {selectedClientSyncIdsFromInvoices.length} selected client(s) will be updated or added. Other existing rows in your spreadsheet will not be removed.
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
                onClick={() => setShowClientSyncModalFromInvoices(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSyncClientsFromInvoices}
                disabled={selectedClientSyncIdsFromInvoices.length === 0 || isSyncingAllClients}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-emerald-600/20"
              >
                {isSyncingAllClients ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span>
                  {isSyncingAllClients
                    ? 'Syncing...'
                    : selectedClientSyncIdsFromInvoices.length === clients.length
                    ? 'Confirm & Sync All Clients'
                    : `Confirm & Sync ${selectedClientSyncIdsFromInvoices.length} Client${selectedClientSyncIdsFromInvoices.length > 1 ? 's' : ''}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE SHEET SYNC SETTINGS MODAL */}
      {showSheetModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden"
          onClick={e => { if (e.target === e.currentTarget) setShowSheetModal(false); }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="shrink-0 p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>Google Sheets & Excel Sync Integration</span>
                    {!isWorkspaceOwner && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center gap-1 shrink-0">
                        <Lock className="h-2.5 w-2.5" /> View Only
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live two-way spreadsheet ledger maintaining separate <b>Invoices</b> and <b>Clients</b> tabs.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSheetModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Owner Permission Notice Banner */}
            {!isWorkspaceOwner && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-800/60 px-5 py-2.5 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300 shrink-0">
                <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-[11px] font-medium leading-snug">
                  <b>View-Only Access:</b> Only the <b>Workspace Owner</b> is authorized to edit or modify the Google Sheet URL and Webhook deployment settings.
                </p>
              </div>
            )}

            {/* Body */}
            <form onSubmit={handleSaveSheetConfig} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 p-5 sm:p-6 space-y-5 overflow-y-auto">
                
                {/* 1. Google Sheet Link */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Google Sheet Link (Spreadsheet URL)
                    </label>
                    {sheetModalUrl && (
                      <a
                        href={sheetModalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        Open Sheet <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <input
                    type="url"
                    disabled={!isWorkspaceOwner}
                    placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit"
                    value={sheetModalUrl}
                    onChange={e => setSheetModalUrl(e.target.value)}
                    className={`w-full px-3.5 py-2 border rounded-xl text-xs text-slate-900 dark:text-slate-100 font-mono transition-colors ${
                      !isWorkspaceOwner 
                        ? 'bg-slate-100/80 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 cursor-not-allowed text-slate-500' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-600'
                    }`}
                  />
                  <p className="text-[10px] text-slate-400">
                    Paste the direct URL of your Google Sheet so you and your team can open it with 1 click.
                  </p>
                </div>

                {/* 2. Apps Script Webhook URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Apps Script Webhook URL (Web App Deployment) *
                    </label>
                    <button
                      type="button"
                      onClick={handleTestSheetConnection}
                      disabled={isTestingSheet || !sheetModalWebhook.trim()}
                      className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-100 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    >
                      {isTestingSheet ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span>Test Connection</span>
                    </button>
                  </div>
                  <input
                    type="url"
                    required
                    disabled={!isWorkspaceOwner}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={sheetModalWebhook}
                    onChange={e => setSheetModalWebhook(e.target.value)}
                    className={`w-full px-3.5 py-2 border rounded-xl text-xs text-slate-900 dark:text-slate-100 font-mono transition-colors ${
                      !isWorkspaceOwner 
                        ? 'bg-slate-100/80 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 cursor-not-allowed text-slate-500' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-600'
                    }`}
                  />

                  {sheetModalWebhook.includes('docs.google.com/spreadsheets') && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Notice: This is your spreadsheet link. The Webhook URL is generated when you click &quot;Deploy &gt; New deployment &gt; Web app&quot; in Apps Script and ends with &quot;/exec&quot;.
                    </p>
                  )}

                  {/* Connection Test Result Badge */}
                  {sheetTestResult && (
                    <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                      sheetTestResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    }`}>
                      {sheetTestResult.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}
                      <span>{sheetTestResult.message}</span>
                    </div>
                  )}
                </div>

                {/* 3. Setup Guide & Copy Script */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-650 dark:text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      How to Set Up in Google Sheets (2 Minutes)
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAppsScript}
                      className="flex items-center gap-1 px-3 py-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs hover:opacity-90"
                    >
                      {hasCopiedScript ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{hasCopiedScript ? 'Copied Code!' : 'Copy Apps Script Code'}</span>
                    </button>
                  </div>

                  <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Create a new spreadsheet or open your existing sheet in Google Sheets.</li>
                    <li>Click <b>Extensions &gt; Apps Script</b> in the top navigation bar.</li>
                    <li>Delete any placeholder code in <code>Code.gs</code> and click <b>Copy Apps Script Code</b> above to paste it.</li>
                    <li>Click the blue <b>Deploy &gt; New deployment</b> button (top-right).</li>
                    <li>Select type: <b>Web app</b>. Set <i>Execute as:</i> <b>Me</b>, and <i>Who has access:</i> <b>Anyone</b>.</li>
                    <li>Click <b>Deploy</b>, authorize permissions, and copy the <b>Web App URL</b> into the box above.</li>
                  </ol>
                  <p className="text-[10px] text-slate-400 italic">
                    The script will automatically create the <b>Invoices</b> and <b>Clients</b> bottom tabs and format them on your first sync.
                  </p>
                </div>

                {/* Sync status info */}
                {(sheetConfig.lastInvoiceSync || sheetConfig.lastClientSync) && (
                  <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {sheetConfig.lastInvoiceSync && (
                      <div>Last Invoices Sync: <span className="font-semibold text-slate-600 dark:text-slate-300">{new Date(sheetConfig.lastInvoiceSync).toLocaleString()}</span></div>
                    )}
                    {sheetConfig.lastClientSync && (
                      <div>Last Clients Sync: <span className="font-semibold text-slate-600 dark:text-slate-300">{new Date(sheetConfig.lastClientSync).toLocaleString()}</span></div>
                    )}
                  </div>
                )}

              </div>

              {/* Footer Actions */}
              <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                <button
                  type="button"
                  onClick={() => setShowSheetModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Close
                </button>
                {isWorkspaceOwner ? (
                  <button
                    type="submit"
                    className="px-5 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold cursor-pointer transition-opacity shadow-sm hover:opacity-90 flex items-center gap-1.5"
                  >
                    <span>Save Integration Settings</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>Owner Access Required to Edit</span>
                  </div>
                )}
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Monthly Tax Invoice & GST Filing Report Modal (Centered Popup) */}
      {showGstReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-hidden animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGstReport(false);
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/70">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                      Tax Invoice & GST Filing Report
                    </h2>
                    <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      GSTR-1 & GSTR-3B Ready
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Supplier: Docdril (Bihar · 10)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    GST tax invoice breakdown & metrics for{' '}
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {selectedReportMonthName} {selectedReportYear}
                    </span>{' '}
                    ({monthlyTaxInvoices.length} tax invoice{monthlyTaxInvoices.length === 1 ? '' : 's'})
                  </p>
                </div>
              </div>

              {/* Action buttons & Month picker */}
              <div className="flex items-center gap-2 flex-wrap self-end md:self-auto shrink-0">
                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-lg px-2.5 py-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                    className="text-xs font-bold bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Auto ({selectedReportMonthName})</option>
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={m} value={String(idx)}>{m}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={copyGstSummaryToClipboard}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-205 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 transition cursor-pointer"
                  title="Copy formatted GST summary text to clipboard"
                >
                  {copiedGstSummary ? (
                    <>
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                      <span>Copy Summary</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={exportGstReportCsv}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                  title="Export itemized GST tax invoices to CSV file"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGstReport(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="Close popup"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-slate-50/40 dark:bg-slate-950/20">
              {monthlyTaxInvoices.length === 0 ? (
                <div className="py-12 text-center bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
                  <FileSpreadsheet className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    No tax invoices found for {selectedReportMonthName} {selectedReportYear}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Only invoices categorized as Tax Invoices (excluding proformas and receipts) are calculated for GST filing.
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterMonth('all')}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      View active month with invoices
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 6 Key GST Metrics (GSTR-3B Table 3.1) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Taxable Turnover
                      </span>
                      <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                        ₹{gstReportSummary.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                        GSTR-3B Table 3.1(a)
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-blue-200 dark:border-blue-900/50 shadow-2xs">
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                        Integrated Tax (IGST)
                      </span>
                      <span className="text-base font-black text-blue-700 dark:text-blue-300 mt-0.5 block">
                        ₹{gstReportSummary.totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                        Inter-state supplies
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-indigo-200 dark:border-indigo-900/50 shadow-2xs">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                        Central Tax (CGST)
                      </span>
                      <span className="text-base font-black text-indigo-700 dark:text-indigo-300 mt-0.5 block">
                        ₹{gstReportSummary.totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                        Intra-state (Bihar 50%)
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-violet-200 dark:border-violet-900/50 shadow-2xs">
                      <span className="text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400 block">
                        State Tax (SGST)
                      </span>
                      <span className="text-base font-black text-violet-700 dark:text-violet-300 mt-0.5 block">
                        ₹{gstReportSummary.totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                        Intra-state (Bihar 50%)
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-2xs">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                        Total Tax Payable
                      </span>
                      <span className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5 block">
                        ₹{gstReportSummary.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                        IGST + CGST + SGST
                      </span>
                    </div>

                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Gross Invoiced
                      </span>
                      <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                        ₹{gstReportSummary.totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                        Taxable + Tax
                      </span>
                    </div>
                  </div>

                  {/* GSTR-1 Classification Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          Table 4 · B2B Registered
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                          {gstReportSummary.b2bCount} invoice{gstReportSummary.b2bCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Registered recipients with valid GSTIN (requires individual invoice entry on GST Portal).
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-semibold">Taxable: ₹{gstReportSummary.b2bTaxable.toFixed(2)}</span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold">Tax: ₹{gstReportSummary.b2bTax.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          Table 7 · B2C Domestic
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                          {gstReportSummary.b2cCount} invoice{gstReportSummary.b2cCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Unregistered domestic individuals & businesses (reported net consolidated state-wise).
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-semibold">Taxable: ₹{gstReportSummary.b2cTaxable.toFixed(2)}</span>
                        <span className="text-purple-600 dark:text-purple-400 font-bold">Tax: ₹{gstReportSummary.b2cTax.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          Table 6 · Exports / Zero-Rated (LUT)
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                          {gstReportSummary.exportCount} invoice{gstReportSummary.exportCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        International cross-border supplies under Letter of Undertaking without payment of IGST.
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-semibold">Turnover: ₹{gstReportSummary.exportTaxable.toFixed(2)}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-bold">Tax: ₹0.00</span>
                      </div>
                    </div>
                  </div>

                  {/* State-wise Place of Supply Breakdown */}
                  {gstReportSummary.stateBreakdown.length > 0 && (
                    <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
                      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          State-wise Place of Supply (POS) Summary
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {gstReportSummary.stateBreakdown.length} Jurisdictions
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                              <th className="px-3.5 py-2">Place of Supply</th>
                              <th className="px-3.5 py-2">Supply Type</th>
                              <th className="px-3.5 py-2 text-center">Count</th>
                              <th className="px-3.5 py-2 text-right">Taxable Turnover (₹)</th>
                              <th className="px-3.5 py-2 text-right">IGST (₹)</th>
                              <th className="px-3.5 py-2 text-right">CGST + SGST (₹)</th>
                              <th className="px-3.5 py-2 text-right">Total (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                            {gstReportSummary.stateBreakdown.map(st => (
                              <tr key={st.pos} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                <td className="px-3.5 py-2 font-bold text-slate-800 dark:text-slate-200">{st.pos}</td>
                                <td className="px-3.5 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    st.isIntra
                                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                      : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                  }`}>
                                    {st.isIntra ? 'Intra-State' : 'Inter-State'}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2 text-center text-slate-500">{st.count}</td>
                                <td className="px-3.5 py-2 text-right">{st.taxable.toFixed(2)}</td>
                                <td className="px-3.5 py-2 text-right text-blue-600 dark:text-blue-400">{st.igst > 0 ? st.igst.toFixed(2) : '-'}</td>
                                <td className="px-3.5 py-2 text-right text-indigo-600 dark:text-indigo-400">{(st.cgst + st.sgst) > 0 ? (st.cgst + st.sgst).toFixed(2) : '-'}</td>
                                <td className="px-3.5 py-2 text-right font-black text-slate-900 dark:text-white">{st.total.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Itemized Tax Invoices Table for the Month */}
                  <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
                    <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                        Tax Invoices for {selectedReportMonthName} {selectedReportYear}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        Click any invoice to view or preview
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
                            <th className="px-3.5 py-2">Invoice #</th>
                            <th className="px-3.5 py-2">Date</th>
                            <th className="px-3.5 py-2">Client / Buyer</th>
                            <th className="px-3.5 py-2">GSTIN / Category</th>
                            <th className="px-3.5 py-2">Place of Supply</th>
                            <th className="px-3.5 py-2 text-right">Taxable (₹)</th>
                            <th className="px-3.5 py-2 text-center">Rate</th>
                            <th className="px-3.5 py-2 text-right">IGST (₹)</th>
                            <th className="px-3.5 py-2 text-right">CGST+SGST (₹)</th>
                            <th className="px-3.5 py-2 text-right">Total (₹)</th>
                            <th className="px-3.5 py-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                          {monthlyTaxInvoices.map(inv => (
                            <tr
                              key={inv.id}
                              onClick={() => {
                                setShowGstReport(false);
                                setSelectedInvoice(inv);
                              }}
                              className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer transition-colors"
                            >
                              <td className="px-3.5 py-2.5 font-bold text-blue-600 dark:text-blue-400 hover:underline">
                                {inv.invoiceNumber}
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap text-[11px]">
                                {inv.issueDate}
                              </td>
                              <td className="px-3.5 py-2.5 font-bold text-slate-800 dark:text-slate-200 max-w-[150px] truncate">
                                {inv.clientName}
                              </td>
                              <td className="px-3.5 py-2.5">
                                {inv.isLut ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                    LUT Export
                                  </span>
                                ) : inv.clientGst ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                                    {inv.clientGst}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    B2C Unregistered
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400 text-[11px] whitespace-nowrap">
                                {inv.placeOfSupply}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-medium">
                                {inv.subtotal.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5 text-center text-slate-400 text-[11px]">
                                {inv.gstRate}%
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-blue-600 dark:text-blue-400 font-medium">
                                {inv.igst > 0 ? inv.igst.toFixed(2) : '-'}
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-indigo-600 dark:text-indigo-400 font-medium">
                                {(inv.cgst + inv.sgst) > 0 ? (inv.cgst + inv.sgst).toFixed(2) : '-'}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-black text-slate-900 dark:text-white">
                                {inv.total.toFixed(2)}
                              </td>
                              <td className="px-3.5 py-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  inv.status === 'paid'
                                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : inv.status === 'overdue'
                                    ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                    : inv.status === 'sent'
                                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}>
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="shrink-0 p-3.5 px-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Docdril GSTIN: <span className="font-bold text-slate-700 dark:text-slate-200">{businessProfile.gstin || '10CKTPC0886R1ZL'}</span> · State: <span className="font-bold text-slate-700 dark:text-slate-200">Bihar (10)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGstReport(false)}
                className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT AREA (Hidden) */}
      <div ref={printAreaRef} style={{ display: 'none' }} />

    </div>
  );
}
