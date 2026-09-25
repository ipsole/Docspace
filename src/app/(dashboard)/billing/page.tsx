'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useConfirm } from '@/context/ConfirmContext';
import {
  FileSpreadsheet, Plus, DollarSign, Clock, CheckCircle2,
  AlertCircle, Trash2, Edit3, TrendingDown, CreditCard,
  Building, Search, Filter, Calendar, ShieldCheck, Check, X,
  Repeat, Tag, ArrowRight, HelpCircle, Layers, Sparkles,
  Download, ChevronDown, ChevronLeft, ChevronRight, BarChart3,
  PieChart, Zap, ChevronUp, Briefcase, LayoutGrid, ListFilter,
  RefreshCw, Building2
} from 'lucide-react';

export interface BusinessExpense {
  id: string;
  vendorName: string;
  category: 'Software & Tooling' | 'Infrastructure & Hosting' | 'Contractors & Manpower' | 'Marketing & Growth' | 'Office & Utilities' | 'Hardware & Equipment' | 'Legal & Admin';
  expenseType: 'Recurring / Monthly' | 'Recurring / Annual' | 'Direct Expense' | 'Indirect Expense' | 'One-Time Activity';
  referenceNo: string;
  baseAmount: number;     // Cost before tax
  gstRate: number;        // 0, 5, 12, 18, 28
  taxAmount: number;      // GST amount paid
  totalAmount: number;    // baseAmount + taxAmount
  currency: string;
  date: string;
  dueDate: string;
  billingMonth: string;   // e.g. "2026-09" or "all"
  paymentMethod: 'Corporate Card' | 'Bank Transfer (NEFT/RTGS)' | 'UPI' | 'Company Wire' | 'Petty Cash';
  status: 'paid' | 'pending' | 'scheduled';
  
  // GST Claim & Realization Tracking
  gstClaimStatus: 'Claimed (ITC Taken)' | 'Eligible (Pending Filing)' | 'Not Claimed' | 'Ineligible / Blocked (Sec 17(5))' | 'Exempt / Non-GST';
  realizationMethod: 'Tax Credit Offset (Against Output Tax)' | 'Upfront Price Reduced / Vendor Discount' | 'Later Claim / Refund Issued' | 'Expensed to P&L (Direct Cost)' | 'Pending Credit Note';
  notes?: string;

  // Recurring Subscriptions vs Month-Specific Expenses
  isRecurring?: boolean;
  recurringCadence?: 'Monthly' | 'Annual' | 'Quarterly';
  monthStatusOverrides?: Record<string, 'paid' | 'pending' | 'scheduled'>; // e.g. "2026-09" -> "paid"
}

const isExpenseRecurring = (exp: BusinessExpense): boolean => {
  return exp.isRecurring === true || exp.expenseType === 'Recurring / Monthly' || exp.expenseType === 'Recurring / Annual';
};

const getExpenseStatusForMonth = (exp: BusinessExpense, month: string): BusinessExpense['status'] => {
  if (exp.monthStatusOverrides && exp.monthStatusOverrides[month]) {
    return exp.monthStatusOverrides[month];
  }
  return exp.status;
};



const DEFAULT_EXPENSES: BusinessExpense[] = [
  {
    id: 'exp-1',
    vendorName: 'Amazon Web Services (AWS)',
    category: 'Infrastructure & Hosting',
    expenseType: 'Recurring / Monthly',
    isRecurring: true,
    recurringCadence: 'Monthly',
    referenceNo: 'AWS-2026-09-IN',
    baseAmount: 18450,
    gstRate: 18,
    taxAmount: 3321,
    totalAmount: 21771,
    currency: 'INR',
    date: '2026-09-02',
    dueDate: '2026-09-15',
    billingMonth: '2026-09',
    paymentMethod: 'Corporate Card',
    status: 'paid',
    gstClaimStatus: 'Claimed (ITC Taken)',
    realizationMethod: 'Tax Credit Offset (Against Output Tax)',
    notes: 'EC2 cloud compute clusters, S3 storage buckets, and Edge distribution.',
  },
  {
    id: 'exp-2',
    vendorName: 'Vercel Inc.',
    category: 'Infrastructure & Hosting',
    expenseType: 'Recurring / Monthly',
    isRecurring: true,
    recurringCadence: 'Monthly',
    referenceNo: 'VERCEL-PRO-8491',
    baseAmount: 4200,
    gstRate: 18,
    taxAmount: 756,
    totalAmount: 4956,
    currency: 'INR',
    date: '2026-09-05',
    dueDate: '2026-09-18',
    billingMonth: '2026-09',
    paymentMethod: 'Corporate Card',
    status: 'paid',
    gstClaimStatus: 'Claimed (ITC Taken)',
    realizationMethod: 'Tax Credit Offset (Against Output Tax)',
    notes: 'Enterprise Edge hosting & serverless function pipeline.',
  },
  {
    id: 'exp-3',
    vendorName: 'Apple India / Croma Retail',
    category: 'Hardware & Equipment',
    expenseType: 'One-Time Activity',
    isRecurring: false,
    referenceNo: 'CROMA-2026-9102',
    baseAmount: 124900,
    gstRate: 18,
    taxAmount: 22482,
    totalAmount: 147382,
    currency: 'INR',
    date: '2026-09-08',
    dueDate: '2026-09-08',
    billingMonth: '2026-09',
    paymentMethod: 'Corporate Card',
    status: 'paid',
    gstClaimStatus: 'Claimed (ITC Taken)',
    realizationMethod: 'Upfront Price Reduced / Vendor Discount',
    notes: 'MacBook Pro M3 Max for development lead; GST invoice claimed with direct commercial discount.',
  },
  {
    id: 'exp-4',
    vendorName: 'Google Workspace & Cloud Identity',
    category: 'Software & Tooling',
    expenseType: 'Recurring / Monthly',
    isRecurring: true,
    recurringCadence: 'Monthly',
    referenceNo: 'GSUITE-9921',
    baseAmount: 6800,
    gstRate: 18,
    taxAmount: 1224,
    totalAmount: 8024,
    currency: 'INR',
    date: '2026-09-10',
    dueDate: '2026-09-25',
    billingMonth: '2026-09',
    paymentMethod: 'Corporate Card',
    status: 'paid',
    gstClaimStatus: 'Claimed (ITC Taken)',
    realizationMethod: 'Tax Credit Offset (Against Output Tax)',
    notes: 'Corporate email seats, cloud storage, and video conferencing.',
  },
  {
    id: 'exp-5',
    vendorName: 'Senior UI/UX Contractor',
    category: 'Contractors & Manpower',
    expenseType: 'Direct Expense',
    isRecurring: false,
    referenceNo: 'CTR-ROHIT-09',
    baseAmount: 45000,
    gstRate: 0,
    taxAmount: 0,
    totalAmount: 45000,
    currency: 'INR',
    date: '2026-09-18',
    dueDate: '2026-09-30',
    billingMonth: '2026-09',
    paymentMethod: 'Bank Transfer (NEFT/RTGS)',
    status: 'pending',
    gstClaimStatus: 'Exempt / Non-GST',
    realizationMethod: 'Expensed to P&L (Direct Cost)',
    notes: 'Direct client project deliverables and UI component implementation.',
  },
  {
    id: 'exp-6',
    vendorName: 'Export Import Trade Consultation',
    category: 'Legal & Admin',
    expenseType: 'One-Time Activity',
    isRecurring: false,
    referenceNo: 'LEGAL-EXP-4401',
    baseAmount: 22000,
    gstRate: 18,
    taxAmount: 3960,

    totalAmount: 25960,
    currency: 'INR',
    date: '2026-08-20',
    dueDate: '2026-08-25',
    billingMonth: '2026-08',
    paymentMethod: 'Bank Transfer (NEFT/RTGS)',
    status: 'paid',
    gstClaimStatus: 'Claimed (ITC Taken)',
    realizationMethod: 'Later Claim / Refund Issued',
    notes: 'Filing LUT compliance and export refund claim through tax department.',
  }
];

const CATEGORIES: BusinessExpense['category'][] = [
  'Software & Tooling',
  'Infrastructure & Hosting',
  'Contractors & Manpower',
  'Marketing & Growth',
  'Office & Utilities',
  'Hardware & Equipment',
  'Legal & Admin'
];

const EXPENSE_TYPES: BusinessExpense['expenseType'][] = [
  'Recurring / Monthly',
  'Recurring / Annual',
  'Direct Expense',
  'Indirect Expense',
  'One-Time Activity'
];

const GST_CLAIM_STATUSES: BusinessExpense['gstClaimStatus'][] = [
  'Claimed (ITC Taken)',
  'Eligible (Pending Filing)',
  'Not Claimed',
  'Ineligible / Blocked (Sec 17(5))',
  'Exempt / Non-GST'
];

const REALIZATION_METHODS: BusinessExpense['realizationMethod'][] = [
  'Tax Credit Offset (Against Output Tax)',
  'Upfront Price Reduced / Vendor Discount',
  'Later Claim / Refund Issued',
  'Expensed to P&L (Direct Cost)',
  'Pending Credit Note'
];

const MONTHS_LIST = [
  { num: '01', short: 'Jan', full: 'January' },
  { num: '02', short: 'Feb', full: 'February' },
  { num: '03', short: 'Mar', full: 'March' },
  { num: '04', short: 'Apr', full: 'April' },
  { num: '05', short: 'May', full: 'May' },
  { num: '06', short: 'Jun', full: 'June' },
  { num: '07', short: 'Jul', full: 'July' },
  { num: '08', short: 'Aug', full: 'August' },
  { num: '09', short: 'Sep', full: 'September' },
  { num: '10', short: 'Oct', full: 'October' },
  { num: '11', short: 'Nov', full: 'November' },
  { num: '12', short: 'Dec', full: 'December' },
];

export default function BillingPage() {
  const { activeWorkspace } = useWorkspace();
  const confirm = useConfirm();

  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);

  // View Layout Mode: 'cards' (Dedicated Month View with 2 distinct cards) | 'table' (Full Ledger Table)
  const [billingViewLayout, setBillingViewLayout] = useState<'cards' | 'table'>('cards');
  const [mobileCardsTab, setMobileCardsTab] = useState<'recurring' | 'additional'>('recurring');

  // Time & Period Navigation State
  // Mode: 'month' (specific month of a year) | 'year' (all months of a year) | 'all' (all time across all years)
  const [timeFilterMode, setTimeFilterMode] = useState<'month' | 'year' | 'all'>('month');
  const [selectedYear, setSelectedYear] = useState<string>(() => new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7)); // e.g. "2026-09"

  // Quick Shot View Toggle
  const [showQuickShot, setShowQuickShot] = useState<boolean>(false);

  // Export Menu State
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Secondary Filters
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedRealization, setSelectedRealization] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'scheduled'>('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BusinessExpense | null>(null);

  // Form States
  const [formIsRecurring, setFormIsRecurring] = useState<boolean>(true);
  const [vendorName, setVendorName] = useState('');
  const [category, setCategory] = useState<BusinessExpense['category']>('Software & Tooling');
  const [expenseType, setExpenseType] = useState<BusinessExpense['expenseType']>('Recurring / Monthly');
  const [referenceNo, setReferenceNo] = useState('');
  const [baseAmount, setBaseAmount] = useState<number | ''>('');
  const [gstRate, setGstRate] = useState<number>(18);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [billingMonth, setBillingMonth] = useState(new Date().toISOString().slice(0, 7));
  const [paymentMethod, setPaymentMethod] = useState<BusinessExpense['paymentMethod']>('Corporate Card');
  const [status, setStatus] = useState<BusinessExpense['status']>('paid');
  const [gstClaimStatus, setGstClaimStatus] = useState<BusinessExpense['gstClaimStatus']>('Claimed (ITC Taken)');
  const [realizationMethod, setRealizationMethod] = useState<BusinessExpense['realizationMethod']>('Tax Credit Offset (Against Output Tax)');
  const [notes, setNotes] = useState('');

  // Handle Escape key & Outside Click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
        setShowExportMenu(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load expenses from Server & Workspace localStorage
  useEffect(() => {
    if (!activeWorkspace) return;
    const storageKey = `docspace_expenses_v2_${activeWorkspace.id}`;
    const cached = localStorage.getItem(storageKey);

    if (cached) {
      try {
        setExpenses(JSON.parse(cached));
      } catch {
        setExpenses(DEFAULT_EXPENSES);
      }
    } else {
      setExpenses(DEFAULT_EXPENSES);
    }

    // Sync from server API for multi-member persistence
    fetch(`/api/workspaces/expenses?workspaceId=${activeWorkspace.id}`)
      .then(res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(serverData => {
        if (Array.isArray(serverData) && serverData.length > 0) {
          setExpenses(serverData);
          localStorage.setItem(storageKey, JSON.stringify(serverData));
        } else if (!cached) {
          // If server is empty and no local cache, seed default to server
          saveExpenses(DEFAULT_EXPENSES);
        }
      })
      .catch(err => console.error('Error fetching workspace expenses:', err));
  }, [activeWorkspace]);

  // Sync helper (updates state, localStorage, and server)
  const saveExpenses = async (updated: BusinessExpense[]) => {
    setExpenses(updated);
    if (activeWorkspace) {
      localStorage.setItem(`docspace_expenses_v2_${activeWorkspace.id}`, JSON.stringify(updated));
      try {
        await fetch('/api/workspaces/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: activeWorkspace.id, expenses: updated })
        });
      } catch (err) {
        console.error('Failed to sync expenses to server:', err);
      }
    }
  };

  // Form math calculation
  const calculatedTax = useMemo(() => {
    if (baseAmount === '' || Number(baseAmount) <= 0) return 0;
    return Math.round((Number(baseAmount) * (gstRate / 100)) * 100) / 100;
  }, [baseAmount, gstRate]);

  const calculatedTotal = useMemo(() => {
    if (baseAmount === '') return 0;
    return Number(baseAmount) + calculatedTax;
  }, [baseAmount, calculatedTax]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const parts = selectedMonth.split('-');
    let y = parseInt(parts[0]);
    let m = parseInt(parts[1]) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const nextCode = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonth(nextCode);
    setSelectedYear(String(y));
  };

  const handleNextMonth = () => {
    const parts = selectedMonth.split('-');
    let y = parseInt(parts[0]);
    let m = parseInt(parts[1]) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const nextCode = `${y}-${String(m).padStart(2, '0')}`;
    setSelectedMonth(nextCode);
    setSelectedYear(String(y));
  };

  const handleJumpToCurrentMonth = () => {
    const today = new Date();
    const y = today.getFullYear().toString();
    const m = `${y}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    setSelectedYear(y);
    setSelectedMonth(m);
  };

  const openAddRecurringExpense = () => {
    setEditingExpense(null);
    setFormIsRecurring(true);
    setVendorName('');
    setCategory('Software & Tooling');
    setExpenseType('Recurring / Monthly');
    setReferenceNo(`REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setBaseAmount('');
    setGstRate(18);
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
    setBillingMonth('all');
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setDueDate(due.toISOString().split('T')[0]);
    setPaymentMethod('Corporate Card');
    setStatus('paid');
    setGstClaimStatus('Claimed (ITC Taken)');
    setRealizationMethod('Tax Credit Offset (Against Output Tax)');
    setNotes('');
    setShowModal(true);
  };

  const openAddBusinessExpense = (month?: string) => {
    setEditingExpense(null);
    setFormIsRecurring(false);
    setVendorName('');
    setCategory('Hardware & Equipment');
    setExpenseType('One-Time Activity');
    setReferenceNo(`EXP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setBaseAmount('');
    setGstRate(18);
    const targetMonth = month || selectedMonth || new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().split('T')[0];
    setDate(today.startsWith(targetMonth) ? today : `${targetMonth}-01`);
    setBillingMonth(targetMonth);
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setDueDate(due.toISOString().split('T')[0]);
    setPaymentMethod('Corporate Card');
    setStatus('paid');
    setGstClaimStatus('Claimed (ITC Taken)');
    setRealizationMethod('Tax Credit Offset (Against Output Tax)');
    setNotes('');
    setShowModal(true);
  };

  const openAddExpense = () => {
    if (billingViewLayout === 'cards') {
      openAddBusinessExpense(selectedMonth);
    } else {
      openAddBusinessExpense();
    }
  };

  const openEditExpense = (exp: BusinessExpense) => {
    setEditingExpense(exp);
    const rec = isExpenseRecurring(exp);
    setFormIsRecurring(rec);
    setVendorName(exp.vendorName);
    setCategory(exp.category);
    setExpenseType(exp.expenseType);
    setReferenceNo(exp.referenceNo);
    setBaseAmount(exp.baseAmount);
    setGstRate(exp.gstRate);
    setDate(exp.date);
    setDueDate(exp.dueDate);
    setBillingMonth(exp.billingMonth || exp.date.slice(0, 7));
    setPaymentMethod(exp.paymentMethod);
    setStatus(exp.status);
    setGstClaimStatus(exp.gstClaimStatus);
    setRealizationMethod(exp.realizationMethod);
    setNotes(exp.notes || '');
    setShowModal(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim() || baseAmount === '' || Number(baseAmount) <= 0) {
      alert('Please provide a valid vendor name and base amount.');
      return;
    }

    const numBase = Number(baseAmount);
    const numTax = calculatedTax;
    const numTotal = calculatedTotal;

    const resolvedExpenseType = formIsRecurring
      ? (expenseType.startsWith('Recurring') ? expenseType : 'Recurring / Monthly')
      : (expenseType.startsWith('Recurring') ? 'One-Time Activity' : expenseType);

    if (editingExpense) {
      const updated = expenses.map(exp => {
        if (exp.id === editingExpense.id) {
          return {
            ...exp,
            vendorName: vendorName.trim(),
            category,
            expenseType: resolvedExpenseType,
            isRecurring: formIsRecurring,
            recurringCadence: formIsRecurring ? ('Monthly' as const) : undefined,
            referenceNo: referenceNo.trim(),
            baseAmount: numBase,
            gstRate,
            taxAmount: numTax,
            totalAmount: numTotal,
            date,
            dueDate: dueDate || date,
            billingMonth: formIsRecurring ? 'all' : (billingMonth || date.slice(0, 7)),
            paymentMethod,
            status,
            gstClaimStatus,
            realizationMethod,
            notes: notes.trim() || undefined,
          };
        }
        return exp;
      });
      saveExpenses(updated);
    } else {
      const newExp: BusinessExpense = {
        id: `exp-${Date.now()}`,
        vendorName: vendorName.trim(),
        category,
        expenseType: resolvedExpenseType,
        isRecurring: formIsRecurring,
        recurringCadence: formIsRecurring ? ('Monthly' as const) : undefined,
        referenceNo: referenceNo.trim(),

        baseAmount: numBase,
        gstRate,
        taxAmount: numTax,
        totalAmount: numTotal,
        currency: 'INR',
        date,
        dueDate: dueDate || date,
        billingMonth: formIsRecurring ? 'all' : (billingMonth || date.slice(0, 7)),
        paymentMethod,
        status,
        gstClaimStatus,
        realizationMethod,
        notes: notes.trim() || undefined,
        monthStatusOverrides: {},
      };
      saveExpenses([newExp, ...expenses]);
    }

    setShowModal(false);
  };

  const handleDeleteExpense = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Expense Record',
      message: 'Are you sure you want to delete this business expense record?',
      confirmText: 'Delete Expense',
      variant: 'danger',
    });
    if (!ok) return;
    saveExpenses(expenses.filter(e => e.id !== id));
  };

  const handleToggleStatus = (id: string) => {
    const updated = expenses.map(exp => {
      if (exp.id === id) {
        const nextStatus: BusinessExpense['status'] = exp.status === 'paid' ? 'pending' : 'paid';
        return { ...exp, status: nextStatus };
      }
      return exp;
    });
    saveExpenses(updated);
  };

  const handleToggleRecurringStatus = (id: string, month: string) => {
    const updated = expenses.map(exp => {
      if (exp.id === id) {
        const curStatus = getExpenseStatusForMonth(exp, month);
        const nextStatus: BusinessExpense['status'] = curStatus === 'paid' ? 'pending' : 'paid';
        return {
          ...exp,
          monthStatusOverrides: {
            ...(exp.monthStatusOverrides || {}),
            [month]: nextStatus
          }
        };
      }
      return exp;
    });
    saveExpenses(updated);
  };

  // Available unique billing months across all records
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      if (e.billingMonth) set.add(e.billingMonth);
      else if (e.date) set.add(e.date.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [expenses]);

  // Available unique years across all records + current year
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    const curYear = new Date().getFullYear().toString();
    set.add(curYear);
    set.add((Number(curYear) - 1).toString());
    expenses.forEach(e => {
      const ym = e.billingMonth || e.date.slice(0, 7);
      if (ym) set.add(ym.slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [expenses]);

  // Months with recorded expenses in the currently selected year
  const monthsWithDataInYear = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      const ym = e.billingMonth || e.date.slice(0, 7);
      if (ym && ym.startsWith(selectedYear)) {
        set.add(ym.slice(5, 7));
      }
    });
    return set;
  }, [expenses, selectedYear]);

  // Target period expenses based on active timeFilterMode
  const targetPeriodExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const isRec = isExpenseRecurring(exp);
      const expMonth = exp.billingMonth || exp.date.slice(0, 7);
      const expYear = expMonth.slice(0, 4);

      if (timeFilterMode === 'all') return true;
      if (timeFilterMode === 'year') {
        if (isRec) return true;
        return expYear === selectedYear;
      }
      if (timeFilterMode === 'month') {
        if (isRec) return true;
        return expMonth === selectedMonth;
      }
      return true;
    });
  }, [expenses, timeFilterMode, selectedYear, selectedMonth]);

  // Financial Metrics for the active period
  const metrics = useMemo(() => {
    const totalOutflow = targetPeriodExpenses.reduce((sum, e) => sum + e.totalAmount, 0);
    const totalBase = targetPeriodExpenses.reduce((sum, e) => sum + e.baseAmount, 0);
    const totalGstPaid = targetPeriodExpenses.reduce((sum, e) => sum + e.taxAmount, 0);

    // Recurring / Subscription monthly burn
    const recurringBurn = targetPeriodExpenses
      .filter(e => isExpenseRecurring(e))
      .reduce((sum, e) => sum + e.totalAmount, 0);

    // Realized GST Value (offset, price reduced, or refund issued)
    const realizedGstValue = targetPeriodExpenses
      .filter(e =>
        e.realizationMethod === 'Tax Credit Offset (Against Output Tax)' ||
        e.realizationMethod === 'Upfront Price Reduced / Vendor Discount' ||
        e.realizationMethod === 'Later Claim / Refund Issued'
      )
      .reduce((sum, e) => sum + e.taxAmount, 0);

    const pendingPayables = targetPeriodExpenses.filter(e => {
      const st = getExpenseStatusForMonth(e, selectedMonth);
      return st === 'pending';
    });
    const pendingTotal = pendingPayables.reduce((sum, e) => sum + e.totalAmount, 0);

    return {
      totalOutflow,
      totalBase,
      totalGstPaid,
      recurringBurn,
      realizedGstValue,
      pendingTotal,
      pendingCount: pendingPayables.length,
    };
  }, [targetPeriodExpenses, selectedMonth]);

  // Quick Shot Analytics: Breakdown across ALL expense types and categories
  const quickShotData = useMemo(() => {
    const total = metrics.totalOutflow || 1;

    // 1. Distribution by Expense Nature / Recurrence Type
    const typeBreakdown = EXPENSE_TYPES.map(type => {
      const matching = targetPeriodExpenses.filter(e => e.expenseType === type);
      const amount = matching.reduce((sum, e) => sum + e.totalAmount, 0);
      const percent = Math.round((amount / total) * 100);
      return { type, amount, count: matching.length, percent };
    });

    // 2. Distribution by Category
    const categoryBreakdown = CATEGORIES.map(cat => {
      const matching = targetPeriodExpenses.filter(e => e.category === cat);
      const amount = matching.reduce((sum, e) => sum + e.totalAmount, 0);
      const percent = Math.round((amount / total) * 100);
      return { category: cat, amount, count: matching.length, percent };
    }).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);

    // 3. Distribution by Payment Method
    const paymentMethods = ['Corporate Card', 'Bank Transfer (NEFT/RTGS)', 'UPI', 'Company Wire', 'Petty Cash'] as const;
    const paymentBreakdown = paymentMethods.map(pm => {
      const matching = targetPeriodExpenses.filter(e => e.paymentMethod === pm);
      const amount = matching.reduce((sum, e) => sum + e.totalAmount, 0);
      return { method: pm, amount, count: matching.length };
    }).filter(p => p.amount > 0);

    // 4. Top Vendors by Spend
    const vendorMap = new Map<string, { amount: number; count: number; category: string }>();
    targetPeriodExpenses.forEach(e => {
      const prev = vendorMap.get(e.vendorName) || { amount: 0, count: 0, category: e.category };
      vendorMap.set(e.vendorName, {
        amount: prev.amount + e.totalAmount,
        count: prev.count + 1,
        category: e.category,
      });
    });
    const topVendors = Array.from(vendorMap.entries())
      .map(([name, data]) => ({ name, ...data, percent: Math.round((data.amount / total) * 100) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      typeBreakdown,
      categoryBreakdown,
      paymentBreakdown,
      topVendors,
    };
  }, [targetPeriodExpenses, metrics.totalOutflow]);

  // Filtered expenses list (applying search and secondary filters on targetPeriodExpenses)
  const filteredExpenses = useMemo(() => {
    return targetPeriodExpenses.filter(exp => {
      const matchType = selectedType === 'all' || exp.expenseType === selectedType || exp.category === selectedType;
      const matchRealization = selectedRealization === 'all' || exp.realizationMethod === selectedRealization;
      const statusForMonth = getExpenseStatusForMonth(exp, selectedMonth);
      const matchStatus = statusFilter === 'all' || statusForMonth === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        exp.vendorName.toLowerCase().includes(q) ||
        exp.referenceNo.toLowerCase().includes(q) ||
        exp.category.toLowerCase().includes(q) ||
        (exp.notes && exp.notes.toLowerCase().includes(q));
      return matchType && matchRealization && matchStatus && matchSearch;
    });
  }, [targetPeriodExpenses, selectedType, selectedRealization, statusFilter, searchQuery, selectedMonth]);

  // 1. Recurring Subscriptions list for the active view
  const monthRecurringExpenses = useMemo(() => {
    return filteredExpenses.filter(e => isExpenseRecurring(e));
  }, [filteredExpenses]);

  // 2. Additional Business Expenses list (specific to selectedMonth in month view)
  const monthAdditionalExpenses = useMemo(() => {
    return filteredExpenses.filter(e => !isExpenseRecurring(e));
  }, [filteredExpenses]);

  const monthRecurringTotal = useMemo(() => {
    return monthRecurringExpenses.reduce((sum, e) => sum + e.totalAmount, 0);
  }, [monthRecurringExpenses]);

  const monthAdditionalTotal = useMemo(() => {
    return monthAdditionalExpenses.reduce((sum, e) => sum + e.totalAmount, 0);
  }, [monthAdditionalExpenses]);


  const formatMonthLabel = (m: string) => {
    if (!m) return m;
    const [year, month] = m.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Export to CSV / Excel sheet
  const exportExpensesToSheet = (exportScope: 'current' | 'all') => {
    const listToExport = exportScope === 'all' ? expenses : filteredExpenses;
    if (listToExport.length === 0) {
      alert('No expense records found to export for the selected filters.');
      return;
    }

    const headers = [
      'Reference No',
      'Transaction Date',
      'Billing Month',
      'Due Date',
      'Vendor / Payee',
      'Category',
      'Expense Nature / Activity Type',
      'Payment Method',
      'Status',
      'Base Cost (INR)',
      'GST Rate (%)',
      'GST Paid (INR)',
      'Total Outflow (INR)',
      'GST Claim Status',
      'Realization Method',
      'Item Description / Notes'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = listToExport.map(exp => [
      escapeCsv(exp.referenceNo),
      escapeCsv(exp.date),
      escapeCsv(exp.billingMonth || exp.date.slice(0, 7)),
      escapeCsv(exp.dueDate),
      escapeCsv(exp.vendorName),
      escapeCsv(exp.category),
      escapeCsv(exp.expenseType),
      escapeCsv(exp.paymentMethod),
      escapeCsv(exp.status.toUpperCase()),
      exp.baseAmount,
      `${exp.gstRate}%`,
      exp.taxAmount,
      exp.totalAmount,
      escapeCsv(exp.gstClaimStatus),
      escapeCsv(exp.realizationMethod),
      escapeCsv(exp.notes || '')
    ].join(','));

    // Totals Summary Row
    const sumBase = listToExport.reduce((acc, e) => acc + e.baseAmount, 0);
    const sumTax = listToExport.reduce((acc, e) => acc + e.taxAmount, 0);
    const sumTotal = listToExport.reduce((acc, e) => acc + e.totalAmount, 0);

    const summaryRow = [
      escapeCsv('TOTAL / SUMMARY'),
      escapeCsv(''),
      escapeCsv(''),
      escapeCsv(''),
      escapeCsv(`${listToExport.length} Transactions`),
      escapeCsv(''),
      escapeCsv(''),
      escapeCsv(''),
      escapeCsv(''),
      sumBase,
      escapeCsv(''),
      sumTax,
      sumTotal,
      escapeCsv(''),
      escapeCsv(''),
      escapeCsv('')
    ].join(',');

    // UTF-8 BOM prefix (\uFEFF) ensures Excel properly opens Unicode without mojibake
    const csvContent = '\uFEFF' + [headers.join(','), ...rows, '', summaryRow].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    let periodTag = 'AllTime';
    if (exportScope === 'current') {
      if (timeFilterMode === 'month') periodTag = selectedMonth;
      else if (timeFilterMode === 'year') periodTag = `Year_${selectedYear}`;
      else periodTag = 'AllTime';
    }

    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `Business_Expenses_${periodTag}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // Period label for active view
  const periodViewLabel = useMemo(() => {
    if (timeFilterMode === 'all') return 'All Time (Full Ledger)';
    if (timeFilterMode === 'year') return `Full Year ${selectedYear} (12 Months)`;
    return formatMonthLabel(selectedMonth);
  }, [timeFilterMode, selectedYear, selectedMonth]);

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-gray-800">No Workspace Selected</h2>
          <p className="text-xs text-gray-500 mt-1">Select a workspace to manage business billing and expenses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 md:p-8 space-y-3 sm:space-y-5 max-w-7xl mx-auto flex flex-col text-gray-900 font-sans">
      
      {/* 1. Header (Actions: Quick Shot, Export Sheet, Log Expense) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 sm:h-5 sm:w-5 text-gray-900" />
              Business Billing & Expenses
            </h1>
            <span className="hidden sm:inline-flex px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gray-100 border border-gray-200 text-gray-700 rounded-full">
              Operating Expense Ledger
            </span>
          </div>
          <p className="hidden sm:block text-[11px] text-gray-500 mt-0.5">
            Track company overhead, monthly subscription burn, direct/indirect activities, and GST realization.
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* View Layout Toggle: Month Cards vs Full Table */}
          <div className="flex items-center bg-gray-100 p-0.5 sm:p-1 rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setBillingViewLayout('cards')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billingViewLayout === 'cards'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              title="Dedicated Month View with 2 distinct cards: Recurring vs Additional Expenses"
            >
              <LayoutGrid className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-600" />
              <span>Month Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setBillingViewLayout('table')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billingViewLayout === 'table'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              title="Full Ledger Table View across all records"
            >
              <ListFilter className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-purple-600" />
              <span>Full Table</span>
            </button>
          </div>

          {/* Quick Shot Analysis Toggle Button */}
          <button
            onClick={() => setShowQuickShot(!showQuickShot)}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
              showQuickShot
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
            }`}
            title="Toggle Quick Shot Monthly Expense Analytics"
          >
            <Zap className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${showQuickShot ? 'fill-white' : 'text-amber-500'}`} />
            <span>Quick Shot</span>
            {showQuickShot ? <ChevronUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
          </button>

          {/* Export to Sheet Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Export expenses to spreadsheet sheet"
            >
              <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-600" />
              <span>Export</span>
              <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-gray-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  Export Options
                </div>
                <button
                  onClick={() => exportExpensesToSheet('current')}
                  className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold text-gray-800 hover:bg-gray-50 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex flex-col">
                    <span>Export Current View</span>
                    <span className="text-[10px] text-gray-400 font-normal truncate max-w-[170px]">
                      {periodViewLabel} ({filteredExpenses.length} bills)
                    </span>
                  </div>
                  <Download className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </button>
                <button
                  onClick={() => exportExpensesToSheet('all')}
                  className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold text-gray-800 hover:bg-gray-50 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex flex-col">
                    <span>Export All Expenses</span>
                    <span className="text-[10px] text-gray-400 font-normal">
                      Full Ledger ({expenses.length} records)
                    </span>
                  </div>
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                </button>
              </div>
            )}
          </div>

          {/* Add Recurring Expense Button */}
          <button
            onClick={openAddRecurringExpense}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
            title="Add a recurring subscription that shows across all months"
          >
            <Repeat className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>+ Recurring</span>
          </button>

          {/* Log Business Expense Button */}
          <button
            onClick={openAddExpense}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1 sm:py-2 bg-gray-950 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>+ Log <span className="hidden sm:inline">Business </span>Expense</span>
          </button>
        </div>

      </div>

      {/* 2. Key Expense & GST Realization Metrics Strip (Compact 2x2 grid on mobile) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 shrink-0">
        {/* Total Outflow */}
        <div className="bg-white border border-gray-200/80 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate pr-1">
              {timeFilterMode === 'all' ? 'Total Expenses' : `${periodViewLabel} Outflow`}
            </p>
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
              <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />
            </div>
          </div>
          <p className="text-sm sm:text-xl font-black text-gray-950 mt-0.5 sm:mt-1 truncate">₹{metrics.totalOutflow.toLocaleString()}</p>
          <p className="hidden sm:block text-[9px] sm:text-[10px] text-gray-400 mt-0.5 truncate">Base: ₹{metrics.totalBase.toLocaleString()}</p>
        </div>

        {/* Monthly Recurring Burn */}
        <div className="bg-white border border-gray-200/80 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate pr-1">Recurring & Subs</p>
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
              <Repeat className="h-3 w-3 sm:h-4 sm:w-4" />
            </div>
          </div>
          <p className="text-sm sm:text-xl font-black text-gray-950 mt-0.5 sm:mt-1 truncate">₹{metrics.recurringBurn.toLocaleString()}</p>
          <p className="hidden sm:block text-[9px] sm:text-[10px] text-gray-500 font-medium mt-0.5 truncate">SaaS & retainers</p>
        </div>

        {/* GST Paid on Purchases */}
        <div className="bg-white border border-gray-200/80 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate pr-1">GST Paid</p>
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-3 w-3 sm:h-4 sm:w-4" />
            </div>
          </div>
          <p className="text-sm sm:text-xl font-black text-gray-950 mt-0.5 sm:mt-1 truncate">₹{metrics.totalGstPaid.toLocaleString()}</p>
          <p className="hidden sm:block text-[9px] sm:text-[10px] text-gray-400 mt-0.5 truncate">Input tax paid</p>
        </div>

        {/* Realized GST / Price Reduction */}
        <div className="bg-white border border-gray-200/80 p-2 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate pr-1">Realized GST</p>
            <div className="h-5 w-5 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
            </div>
          </div>
          <p className="text-sm sm:text-xl font-black text-emerald-700 mt-0.5 sm:mt-1 truncate">₹{metrics.realizedGstValue.toLocaleString()}</p>
          <p className="hidden sm:block text-[9px] sm:text-[10px] text-emerald-600 font-medium mt-0.5 truncate">Offset / discount</p>
        </div>
      </div>

      {/* 2B. QUICK SHOT EXPENSE ANALYSIS PANEL (Comprehensive Breakdown Across ALL Types) */}
      {showQuickShot && (
        <div className="bg-gradient-to-br from-gray-900 via-gray-950 to-black text-white p-4 sm:p-5 rounded-2xl shadow-xl shrink-0 space-y-4 border border-gray-800 animate-in fade-in duration-200">
          
          {/* Quick Shot Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 fill-amber-400" />
              </div>
              <h3 className="text-xs font-black tracking-wide uppercase text-white flex items-center gap-1.5">
                Quick Shot Expense Breakdown
                <span className="text-gray-400 font-normal lowercase tracking-normal">
                  — {periodViewLabel}
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span>{targetPeriodExpenses.length} total bills</span>
              <span>•</span>
              <span className="font-bold text-white">₹{metrics.totalOutflow.toLocaleString()} Net Outflow</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Column 1: Outflow Across ALL Expense Types / Natures */}
            <div className="bg-gray-800/40 border border-gray-800 p-3 rounded-xl space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span>By Expense Nature / Type</span>
                <span className="text-[9px] text-amber-400">5 Types</span>
              </p>

              {/* Progress bar visual distribution */}
              <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden flex">
                {quickShotData.typeBreakdown.map((tb, idx) => {
                  const colors = ['bg-blue-500', 'bg-cyan-400', 'bg-indigo-500', 'bg-purple-500', 'bg-emerald-400'];
                  return (
                    <div
                      key={tb.type}
                      style={{ width: `${tb.percent}%` }}
                      className={`h-full ${colors[idx % colors.length]}`}
                      title={`${tb.type}: ₹${tb.amount.toLocaleString()} (${tb.percent}%)`}
                    />
                  );
                })}
              </div>

              {/* List of types */}
              <div className="space-y-1.5 text-xs">
                {quickShotData.typeBreakdown.map(tb => (
                  <div key={tb.type} className="flex items-center justify-between py-0.5 text-[11px]">
                    <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
                      <span className="text-gray-300 truncate" title={tb.type}>{tb.type}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-white">₹{tb.amount.toLocaleString()}</span>
                      <span className="text-[9px] text-gray-400 ml-1.5">({tb.percent}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Outflow by Functional Categories */}
            <div className="bg-gray-800/40 border border-gray-800 p-3 rounded-xl space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span>By Functional Category</span>
                <span className="text-[9px] text-gray-400">{quickShotData.categoryBreakdown.length} active</span>
              </p>

              {quickShotData.categoryBreakdown.length === 0 ? (
                <div className="text-xs text-gray-500 py-3 text-center">No category spending in this period</div>
              ) : (
                <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto pr-1">
                  {quickShotData.categoryBreakdown.map(cb => (
                    <div key={cb.category} className="flex items-center justify-between py-0.5 text-[11px]">
                      <span className="text-gray-300 truncate max-w-[140px]" title={cb.category}>{cb.category}</span>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-white">₹{cb.amount.toLocaleString()}</span>
                        <span className="text-[9px] text-gray-400 ml-1.5">({cb.percent}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Column 3: Top Outflow Payees / Vendors */}
            <div className="bg-gray-800/40 border border-gray-800 p-3 rounded-xl space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span>Top Outflow Payees</span>
                <span className="text-[9px] text-gray-400">Biggest Burn</span>
              </p>

              {quickShotData.topVendors.length === 0 ? (
                <div className="text-xs text-gray-500 py-3 text-center">No vendors in this period</div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {quickShotData.topVendors.map(tv => (
                    <div key={tv.name} className="flex items-center justify-between py-0.5 text-[11px]">
                      <div className="truncate max-w-[140px]" title={tv.name}>
                        <div className="text-white font-medium truncate">{tv.name}</div>
                        <div className="text-[9px] text-gray-400">{tv.category}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-amber-400">₹{tv.amount.toLocaleString()}</span>
                        <span className="text-[9px] text-gray-400 block">{tv.percent}% of total</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 3. MAIN CONTENT: Dedicated Month Split Cards OR Full Ledger Table */}
      {billingViewLayout === 'cards' ? (
        <div className="flex-1 min-h-0 flex flex-col space-y-3 sm:space-y-3.5">
          
          {/* Month Selector & Quick Navigator Bar */}
          <div className="bg-white border border-gray-200/90 p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-2xs shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
            {/* Left: Previous / Next Month Navigation */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-1 sm:p-1.5 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-600 hover:text-gray-900 border border-gray-200 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-gray-900 text-white rounded-lg sm:rounded-xl shadow-xs">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400" />
                <span className="text-xs sm:text-sm font-black tracking-wide">
                  {formatMonthLabel(selectedMonth)}
                </span>
                <span className="text-[9px] sm:text-[10px] font-bold bg-white/20 text-white px-1.5 sm:px-2 py-0.5 rounded-full ml-0.5 sm:ml-1">
                  ₹{metrics.totalOutflow.toLocaleString()} Outflow
                </span>
              </div>

              <button
                onClick={handleNextMonth}
                className="p-1 sm:p-1.5 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-600 hover:text-gray-900 border border-gray-200 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                title="Next Month"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <button
                onClick={handleJumpToCurrentMonth}
                className="px-2 sm:px-2.5 py-1 sm:py-1.5 hover:bg-gray-100 rounded-lg sm:rounded-xl text-gray-600 text-xs font-bold border border-gray-200 transition-colors cursor-pointer"
                title="Jump to Today's Month"
              >
                Current
              </button>
            </div>

            {/* Middle: 12-Month Pills Strip for the Selected Year */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1 shrink-0">
                {selectedYear}:
              </span>
              {MONTHS_LIST.map(m => {
                const monthCode = `${selectedYear}-${m.num}`;
                const isSelected = selectedMonth === monthCode;
                const hasData = monthsWithDataInYear.has(m.num);

                return (
                  <button
                    key={m.num}
                    onClick={() => {
                      setSelectedMonth(monthCode);
                      setTimeFilterMode('month');
                    }}
                    className={`relative px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-gray-900 text-white shadow-2xs font-bold'
                        : hasData
                        ? 'bg-gray-100 text-gray-800 hover:bg-gray-200 font-bold'
                        : 'bg-gray-50/70 text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    <span>{m.short}</span>
                    {hasData && (
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right: Quick Search for this month */}
            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 gap-1.5 w-full md:w-56 shrink-0">
              <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Filter this month's expenses..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none w-full"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile Category Switcher for Month Cards */}
          <div className="lg:hidden flex border border-gray-200 bg-gray-100/90 p-1 rounded-xl shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setMobileCardsTab('recurring')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mobileCardsTab === 'recurring'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Repeat className="h-3.5 w-3.5 text-indigo-600" />
              <span>Recurring ({monthRecurringExpenses.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileCardsTab('additional')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mobileCardsTab === 'additional'
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 text-purple-600" />
              <span>Additional Spend ({monthAdditionalExpenses.length})</span>
            </button>
          </div>

          {/* The 2 Main Split Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 flex-1 min-h-[380px] lg:min-h-0">
            
            {/* COLUMN 1: RECURRING EXPENSES CARD (Synced across all months) */}
            <div className={`${mobileCardsTab === 'additional' ? 'hidden lg:flex' : 'flex'} bg-white border-2 border-indigo-100/90 rounded-2xl sm:rounded-3xl p-3 sm:p-5 flex-col min-h-[340px] lg:min-h-0 shadow-xs relative overflow-hidden flex-1`}>
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-indigo-600" />
              
              {/* Card Header */}
              <div className="flex items-start justify-between pb-2.5 sm:pb-3 border-b border-indigo-50 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg sm:rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                      <Repeat className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <h2 className="text-xs sm:text-sm font-black text-gray-900">Recurring Expenses</h2>
                    <span className="text-[9px] sm:text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 sm:px-2 py-0.5 rounded-full">
                      Auto-synced
                    </span>
                  </div>
                  <p className="hidden sm:block text-[11px] text-gray-400 mt-1">
                    Fixed SaaS subscriptions, cloud infrastructure, and retainers that automatically roll over every month.
                  </p>
                </div>

                <button
                  onClick={openAddRecurringExpense}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg sm:rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>Add Recurring</span>
                </button>
              </div>

              {/* List of Recurring Items */}
              <div className="flex-1 overflow-y-auto py-2 sm:py-3 space-y-2 sm:space-y-2.5 pr-1 min-h-[200px]">
                {monthRecurringExpenses.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <Repeat className="h-8 w-8 mx-auto text-indigo-200" />
                    <p className="text-xs font-bold text-gray-700">No Recurring Subscriptions Found</p>
                    <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                      Add services like AWS, Vercel, Figma, or Google Workspace to auto-populate every month.
                    </p>
                    <button
                      onClick={openAddRecurringExpense}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Recurring Subscription
                    </button>
                  </div>
                ) : (
                  monthRecurringExpenses.map(exp => {
                    const status = getExpenseStatusForMonth(exp, selectedMonth);
                    return (
                      <div
                        key={exp.id}
                        className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 transition-all shadow-2xs space-y-2 sm:space-y-2.5 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <span className="font-black text-xs text-gray-900 truncate">
                                {exp.vendorName}
                              </span>
                              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 px-1.5 sm:px-2 py-0.5 rounded-md">
                                {exp.category}
                              </span>
                              <span className="text-[9px] sm:text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                                <Repeat className="h-2.5 w-2.5" />
                                {exp.recurringCadence || 'Monthly'}
                              </span>
                            </div>
                            {exp.notes && (
                              <p className="text-[11px] text-gray-500 mt-1 line-clamp-1" title={exp.notes}>
                                {exp.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditExpense(exp)}
                              className="p-1 hover:bg-white rounded-lg text-gray-400 hover:text-gray-700 border border-transparent hover:border-gray-200 transition-colors cursor-pointer"
                              title="Edit Recurring Subscription"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 hover:bg-white rounded-lg text-gray-400 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                              title="Delete Subscription"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Financial & Status Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-xs">
                          <div className="flex items-center gap-2.5 sm:gap-3">
                            <div>
                              <span className="text-[9px] sm:text-[10px] text-gray-400 block font-medium">Base</span>
                              <span className="font-semibold text-gray-700 text-[11px] sm:text-xs">₹{exp.baseAmount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[9px] sm:text-[10px] text-gray-400 block font-medium">GST ({exp.gstRate}%)</span>
                              <span className="font-semibold text-gray-700 text-[11px] sm:text-xs">₹{exp.taxAmount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[9px] sm:text-[10px] text-indigo-600 block font-bold">Total / Mo</span>
                              <span className="font-black text-gray-950 text-xs sm:text-sm">₹{exp.totalAmount.toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="hidden sm:inline-block text-[10px] font-semibold text-gray-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md truncate max-w-[130px]" title={exp.realizationMethod}>
                              {exp.realizationMethod.split('(')[0].trim()}
                            </span>

                            <button
                              onClick={() => handleToggleRecurringStatus(exp.id, selectedMonth)}
                              className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              }`}
                              title="Click to toggle status for this month"
                            >
                              {status === 'paid' ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              {status}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Column 1 Footer Subtotal */}
              <div className="pt-2 sm:pt-3 border-t border-indigo-100 shrink-0 flex items-center justify-between text-xs font-bold bg-indigo-50/50 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl">
                <span className="text-indigo-950 flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5 text-indigo-600" />
                  Overhead ({monthRecurringExpenses.length} subs)
                </span>
                <span className="text-indigo-900 font-black text-xs sm:text-sm">
                  ₹{monthRecurringTotal.toLocaleString()}
                </span>
              </div>
            </div>

            {/* COLUMN 2: ADDITIONAL BUSINESS EXPENSES (Specific to this Month) */}
            <div className={`${mobileCardsTab === 'recurring' ? 'hidden lg:flex' : 'flex'} bg-white border-2 border-purple-100/90 rounded-2xl sm:rounded-3xl p-3 sm:p-5 flex-col min-h-[340px] lg:min-h-0 shadow-xs relative overflow-hidden flex-1`}>
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600" />

              {/* Card Header */}
              <div className="flex items-start justify-between pb-2.5 sm:pb-3 border-b border-purple-50 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg sm:rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                      <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <h2 className="text-xs sm:text-sm font-black text-gray-900">Additional Expenses</h2>
                    <span className="text-[9px] sm:text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 sm:px-2 py-0.5 rounded-full">
                      {formatMonthLabel(selectedMonth)}
                    </span>
                  </div>
                  <p className="hidden sm:block text-[11px] text-gray-400 mt-1">
                    One-time equipment purchases, contractor invoices, travel, and ad-hoc business costs for this month.
                  </p>
                </div>

                <button
                  onClick={() => openAddBusinessExpense(selectedMonth)}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg sm:rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>Add Expense</span>
                </button>
              </div>

              {/* List of Month-Specific Items */}
              <div className="flex-1 overflow-y-auto py-2 sm:py-3 space-y-2 sm:space-y-2.5 pr-1 min-h-[200px]">
                {monthAdditionalExpenses.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <Briefcase className="h-8 w-8 mx-auto text-purple-200" />
                    <p className="text-xs font-bold text-gray-700">No Additional Expenses in {formatMonthLabel(selectedMonth)}</p>
                    <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                      No one-off hardware, contractor bills, or ad-hoc costs logged specifically for this month.
                    </p>
                    <button
                      onClick={() => openAddBusinessExpense(selectedMonth)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Log Expense for {formatMonthLabel(selectedMonth)}
                    </button>
                  </div>
                ) : (
                  monthAdditionalExpenses.map(exp => (
                    <div
                      key={exp.id}
                      className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 transition-all shadow-2xs space-y-2 sm:space-y-2.5 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="font-black text-xs text-gray-900 truncate">
                              {exp.vendorName}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 px-1.5 sm:px-2 py-0.5 rounded-md">
                              {exp.category}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.2 rounded-md">
                              {exp.expenseType}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-mono text-gray-400">
                              {exp.referenceNo}
                            </span>
                          </div>
                          {exp.notes && (
                            <p className="text-[11px] text-gray-500 mt-1 line-clamp-1" title={exp.notes}>
                              {exp.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEditExpense(exp)}
                            className="p-1 hover:bg-white rounded-lg text-gray-400 hover:text-gray-700 border border-transparent hover:border-gray-200 transition-colors cursor-pointer"
                            title="Edit Expense"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 hover:bg-white rounded-lg text-gray-400 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                            title="Delete Expense"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Financial & Status Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-xs">
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <div>
                            <span className="text-[9px] sm:text-[10px] text-gray-400 block font-medium">Base</span>
                            <span className="font-semibold text-gray-700 text-[11px] sm:text-xs">₹{exp.baseAmount.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[9px] sm:text-[10px] text-gray-400 block font-medium">GST ({exp.gstRate}%)</span>
                            <span className="font-semibold text-gray-700 text-[11px] sm:text-xs">₹{exp.taxAmount.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[9px] sm:text-[10px] text-purple-600 block font-bold">Total Outflow</span>
                            <span className="font-black text-gray-950 text-xs sm:text-sm">₹{exp.totalAmount.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <span className="hidden sm:inline-block text-[10px] font-semibold text-gray-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md truncate max-w-[130px]" title={exp.realizationMethod}>
                            {exp.realizationMethod.split('(')[0].trim()}
                          </span>

                          <button
                            onClick={() => handleToggleStatus(exp.id)}
                            className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              exp.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                            }`}
                            title="Click to toggle Paid / Pending"
                          >
                            {exp.status === 'paid' ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {exp.status}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Column 2 Footer Subtotal */}
              <div className="pt-2 sm:pt-3 border-t border-purple-100 shrink-0 flex items-center justify-between text-xs font-bold bg-purple-50/50 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl">
                <span className="text-purple-950 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-purple-600" />
                  Additional Spend ({monthAdditionalExpenses.length} items)
                </span>
                <span className="text-purple-900 font-black text-xs sm:text-sm">
                  ₹{monthAdditionalTotal.toLocaleString()}
                </span>
              </div>
            </div>

          </div>

          {/* Bottom Month Reconciliation Summary Bar */}
          <div className="bg-slate-900 text-white rounded-xl sm:rounded-2xl p-2.5 sm:p-3 px-3 sm:px-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm border border-slate-800">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs flex-wrap">
              <span className="font-bold text-gray-300">{formatMonthLabel(selectedMonth)}:</span>
              <span className="text-indigo-300 font-semibold bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-800/60">
                Recurring ₹{monthRecurringTotal.toLocaleString()}
              </span>
              <span className="text-gray-500">+</span>
              <span className="text-purple-300 font-semibold bg-purple-950/80 px-2 py-0.5 rounded-md border border-purple-800/60">
                Additional ₹{monthAdditionalTotal.toLocaleString()}
              </span>
              <span className="text-gray-500">=</span>
              <span className="text-white font-black text-xs sm:text-sm">
                ₹{metrics.totalOutflow.toLocaleString()} Total Outflow
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
              <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-emerald-800/60">
                <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Realized GST: ₹{metrics.realizedGstValue.toLocaleString()}
              </span>
            </div>
          </div>

        </div>
      ) : (
        /* TABLE VIEW (Full Ledger Table) */
        <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
          
          {/* Period Navigation Bar */}
          <div className="bg-white border border-gray-200/90 rounded-2xl p-3 shadow-2xs space-y-2.5 shrink-0">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> View Mode:
                </span>
                <button
                  onClick={() => setTimeFilterMode('month')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    timeFilterMode === 'month' ? 'bg-gray-950 text-white shadow-2xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Month Specific
                </button>
                <button
                  onClick={() => setTimeFilterMode('year')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    timeFilterMode === 'year' ? 'bg-gray-950 text-white shadow-2xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Full Year ({selectedYear})
                </button>
                <button
                  onClick={() => setTimeFilterMode('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    timeFilterMode === 'all' ? 'bg-gray-950 text-white shadow-2xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All Time
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-0.5">
                  <button
                    onClick={() => {
                      const prev = (Number(selectedYear) - 1).toString();
                      setSelectedYear(prev);
                      if (timeFilterMode === 'month') {
                        const monthPart = selectedMonth.slice(5, 7);
                        setSelectedMonth(`${prev}-${monthPart}`);
                      }
                    }}
                    className="p-1 hover:bg-white rounded-lg text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                    title="Previous Year"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  <select
                    value={selectedYear}
                    onChange={e => {
                      const yr = e.target.value;
                      setSelectedYear(yr);
                      if (timeFilterMode === 'month') {
                        const monthPart = selectedMonth.slice(5, 7) || '09';
                        setSelectedMonth(`${yr}-${monthPart}`);
                      }
                    }}
                    className="bg-transparent text-xs font-bold text-gray-900 px-2 py-0.5 focus:outline-none cursor-pointer"
                  >
                    {availableYears.map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      const next = (Number(selectedYear) + 1).toString();
                      setSelectedYear(next);
                      if (timeFilterMode === 'month') {
                        const monthPart = selectedMonth.slice(5, 7);
                        setSelectedMonth(`${next}-${monthPart}`);
                      }
                    }}
                    className="p-1 hover:bg-white rounded-lg text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                    title="Next Year"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 gap-1.5 w-44 sm:w-56 shrink-0">
                  <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search bills, vendor..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-transparent text-xs text-gray-800 placeholder-gray-400 focus:outline-none w-full"
                  />
                </div>
              </div>
            </div>

            {/* 12-Month Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-1 border-t border-gray-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1 shrink-0">
                Months in {selectedYear}:
              </span>
              {MONTHS_LIST.map(m => {
                const monthCode = `${selectedYear}-${m.num}`;
                const isSelected = timeFilterMode === 'month' && selectedMonth === monthCode;
                const hasData = monthsWithDataInYear.has(m.num);

                return (
                  <button
                    key={m.num}
                    onClick={() => {
                      setSelectedMonth(monthCode);
                      setTimeFilterMode('month');
                    }}
                    className={`relative px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-gray-900 text-white shadow-2xs'
                        : hasData
                        ? 'bg-gray-100 text-gray-800 hover:bg-gray-200 font-bold'
                        : 'bg-gray-50/70 text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    <span>{m.short}</span>
                    {hasData && (
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Secondary Activity & Realization Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-gray-100">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1 shrink-0">Activity:</span>
                <button
                  onClick={() => setSelectedType('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    selectedType === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All Activities
                </button>
                {EXPENSE_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedType === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selectedRealization}
                  onChange={e => setSelectedRealization(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Realization Modes</option>
                  {REALIZATION_METHODS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="flex-1 bg-white border border-gray-200/80 rounded-2xl overflow-hidden flex flex-col min-h-0 shadow-2xs">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-w-0">
              {filteredExpenses.length === 0 ? (
                <div className="py-16 text-center text-gray-400 space-y-2">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-300 stroke-[1.5]" />
                  <p className="text-sm font-semibold text-gray-700">No expense records found</p>
                  <p className="text-xs text-gray-400">
                    No purchases recorded for {periodViewLabel} with the active filters.
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[720px] text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-xs border-b border-gray-200/80 text-[10px] font-bold uppercase tracking-wider text-gray-400 z-10">
                    <tr>
                      <th className="py-2.5 px-4">Vendor & Details</th>
                      <th className="py-2.5 px-3">Activity / Nature</th>
                      <th className="py-2.5 px-3">Ref & Month</th>
                      <th className="py-2.5 px-3 text-right">Base Amount</th>
                      <th className="py-2.5 px-3 text-right">GST Paid</th>
                      <th className="py-2.5 px-4 text-right">Total Outflow</th>
                      <th className="py-2.5 px-3">GST Claim & Realization</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredExpenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-gray-50/60 transition-colors">
                        
                        {/* Vendor & Details */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-gray-900">{exp.vendorName}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded">
                              {exp.category}
                            </span>
                            {exp.notes && (
                              <span className="text-[10px] text-gray-400 truncate max-w-[180px]" title={exp.notes}>
                                • {exp.notes}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Activity Nature */}
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            isExpenseRecurring(exp)
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : exp.expenseType === 'Direct Expense'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : exp.expenseType === 'One-Time Activity'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            {isExpenseRecurring(exp) && <Repeat className="h-2.5 w-2.5 shrink-0" />}
                            {exp.expenseType}
                          </span>
                        </td>

                        {/* Ref & Month */}
                        <td className="py-3 px-3 text-gray-600 font-mono text-[11px]">
                          <div>{exp.referenceNo}</div>
                          <div className="text-gray-400 text-[10px] font-sans">
                            {formatMonthLabel(exp.billingMonth || exp.date.slice(0, 7))}
                          </div>
                        </td>

                        {/* Base Amount */}
                        <td className="py-3 px-3 text-right text-gray-700 font-medium">
                          ₹{exp.baseAmount.toLocaleString()}
                        </td>

                        {/* GST Paid */}
                        <td className="py-3 px-3 text-right">
                          {exp.taxAmount > 0 ? (
                            <div>
                              <span className="font-semibold text-gray-900">₹{exp.taxAmount.toLocaleString()}</span>
                              <span className="text-[9px] text-gray-400 block">({exp.gstRate}%)</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[11px]">—</span>
                          )}
                        </td>

                        {/* Total Outflow */}
                        <td className="py-3 px-4 text-right font-black text-gray-950">
                          ₹{exp.totalAmount.toLocaleString()}
                        </td>

                        {/* GST Claim & How Realized */}
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                                exp.gstClaimStatus === 'Claimed (ITC Taken)'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : exp.gstClaimStatus === 'Eligible (Pending Filing)'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : exp.gstClaimStatus === 'Ineligible / Blocked (Sec 17(5))'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {exp.gstClaimStatus}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                              <span className="text-gray-400">Mode:</span>
                              <span className="truncate max-w-[190px]" title={exp.realizationMethod}>
                                {exp.realizationMethod.split('(')[0].trim()}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleToggleStatus(exp.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              exp.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : exp.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                            title="Click to toggle Paid / Pending"
                          >
                            {exp.status === 'paid' && <Check className="h-3 w-3" />}
                            {exp.status}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditExpense(exp)}
                              className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                              title="Edit Expense"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Delete Expense"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}


      {/* 5. Add / Edit Expense Modal with Full GST & Realization Tracking */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200 shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="shrink-0 p-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {editingExpense ? 'Edit Business Expense Record' : 'Log Business Expense / Bill'}
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Record company overhead, subscriptions, direct/indirect costs, and GST claim realization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-50 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveExpense} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 p-5 space-y-4 overflow-y-auto">
              
              {/* Type Switcher: Recurring Subscription vs Additional Business Expense */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setFormIsRecurring(true);
                    if (!expenseType.startsWith('Recurring')) {
                      setExpenseType('Recurring / Monthly');
                    }
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    formIsRecurring
                      ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  <span>Recurring Subscription</span>
                  <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded-full border border-indigo-200">
                    All Months
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormIsRecurring(false);
                    if (expenseType.startsWith('Recurring')) {
                      setExpenseType('One-Time Activity');
                    }
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    !formIsRecurring
                      ? 'bg-white text-purple-700 shadow-sm border border-purple-100'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>Additional Business Exp</span>
                  <span className="text-[9px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded-full border border-purple-200">
                    Month Specific
                  </span>
                </button>
              </div>

              {/* Explanatory banner */}
              <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                formIsRecurring
                  ? 'bg-indigo-50/70 border border-indigo-100 text-indigo-900'
                  : 'bg-purple-50/70 border border-purple-100 text-purple-900'
              }`}>
                {formIsRecurring ? (
                  <>
                    <Repeat className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span>
                      <strong>Recurring Subscription:</strong> Automatically populates in <strong>every month card</strong> under Recurring Expenses.
                    </span>
                  </>
                ) : (
                  <>
                    <Briefcase className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                    <span>
                      <strong>Month-Specific Expense:</strong> Recorded specifically for <strong>{formatMonthLabel(billingMonth)}</strong> under Additional Business Expenses.
                    </span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Vendor Name */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Vendor / Payee / Service Provider *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AWS, Apple Store, Office Landlord, Figma"
                    value={vendorName}
                    onChange={e => setVendorName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900"
                  />
                </div>

                {/* Expense Nature / Type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {formIsRecurring ? 'Billing Cadence *' : 'Activity / Recurrence Type *'}
                  </label>
                  <select
                    value={expenseType}
                    onChange={e => setExpenseType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
                  >
                    {formIsRecurring ? (
                      <>
                        <option value="Recurring / Monthly">Recurring / Monthly</option>
                        <option value="Recurring / Annual">Recurring / Annual</option>
                      </>
                    ) : (
                      <>
                        <option value="One-Time Activity">One-Time Activity</option>
                        <option value="Direct Expense">Direct Expense</option>
                        <option value="Indirect Expense">Indirect Expense</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Category</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Billing Month (for monthly tracking) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {formIsRecurring ? 'Applicability' : 'Billing Month (Tracking) *'}
                  </label>
                  {formIsRecurring ? (
                    <input
                      type="text"
                      disabled
                      value="Auto-synced across all months"
                      className="w-full px-3 py-2 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-700 font-semibold cursor-not-allowed"
                    />
                  ) : (
                    <input
                      type="month"
                      required
                      value={billingMonth}
                      onChange={e => setBillingMonth(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900"
                    />
                  )}
                </div>


                {/* Bill Ref # */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Bill / Invoice Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-001"
                    value={referenceNo}
                    onChange={e => setReferenceNo(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900"
                  />
                </div>

                {/* Base Amount */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Base Cost (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 15000"
                    value={baseAmount}
                    onChange={e => setBaseAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900"
                  />
                </div>

                {/* GST Rate */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">GST Rate (%)</label>
                  <select
                    value={gstRate}
                    onChange={e => setGstRate(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
                  >
                    <option value={0}>0% (Exempt / Non-GST)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% Standard GST</option>
                    <option value={28}>28% Luxury / Hardware</option>
                  </select>
                </div>
              </div>

              {/* Live Outflow Preview Card */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-gray-400">GST Paid: </span>
                  <strong className="text-gray-900">₹{calculatedTax.toLocaleString()}</strong>
                </div>
                <div className="text-right">
                  <span className="text-gray-400">Total Purchase Outflow: </span>
                  <strong className="text-sm font-black text-gray-950">₹{calculatedTotal.toLocaleString()}</strong>
                </div>
              </div>

              {/* GST Claim & Realization Section */}
              <div className="p-3.5 bg-gray-50 border border-gray-200/80 rounded-2xl space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-gray-700" /> GST Claim & Realization Accounting
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Was GST Claimed / Taken? */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Was GST Claimed / Taken?
                    </label>
                    <select
                      value={gstClaimStatus}
                      onChange={e => setGstClaimStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer"
                    >
                      {GST_CLAIM_STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* How it got Realized? */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      How was it Realized?
                    </label>
                    <select
                      value={realizationMethod}
                      onChange={e => setRealizationMethod(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-gray-900 cursor-pointer"
                    >
                      {REALIZATION_METHODS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Payment & Schedule Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Transaction Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
                  >
                    <option value="Corporate Card">Corporate Card</option>
                    <option value="Bank Transfer (NEFT/RTGS)">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI">UPI</option>
                    <option value="Company Wire">Company Wire</option>
                    <option value="Petty Cash">Petty Cash</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Payment Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900 cursor-pointer"
                  >
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Item Description / Purchase Purpose
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Monthly server capacity, hardware serial number, consultant deliverables..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-900 resize-none"
                />
              </div>
            </div>

            {/* Sticky Footer Action Buttons */}
            <div className="shrink-0 px-6 py-3.5 border-t border-gray-100 bg-gray-50/90 flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-400 hidden sm:inline">
                Press <kbd className="font-mono bg-white px-1.5 py-0.5 border border-gray-200 rounded text-[10px] shadow-2xs">Esc</kbd> to dismiss
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-200 hover:bg-white text-gray-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-950 hover:bg-black text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs transition-colors"
                >
                  {editingExpense ? 'Save Expense Changes' : 'Record Business Expense'}
                </button>
              </div>
            </div>
          </form>
          </div>
        </div>
      )}

    </div>
  );
}
