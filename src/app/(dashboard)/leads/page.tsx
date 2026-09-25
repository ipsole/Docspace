'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useConfirm } from '@/context/ConfirmContext';
import {
  Users2, Plus, DollarSign, AlertCircle, Loader2, X,
  TrendingUp, Target, Building2, Trash2, Calendar, ArrowLeft, ArrowRight, CheckCircle2, Briefcase,
  UserPlus, Check, Sparkles, UserCheck
} from 'lucide-react';

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
  createdAt: string;
}

interface Project {
  id: string;
  workspaceId: string;
  clientId: string | null;
  name: string;
  status: string;
  progress: number;
}

interface Lead {
  id: string;
  title: string;
  clientId?: string | null;
  leadType?: 'new_prospect' | 'existing_client';
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  value: number;
  currency?: string;
  stage: 'lead' | 'contacted' | 'proposal_sent' | 'negotiation' | 'won' | 'lost' | 'retainer';
  nextFollowUp?: string;
  notes?: string;
  createdAt: string;
}

const STAGES: { id: Lead['stage']; label: string; color: string; bg: string }[] = [
  { id: 'lead',          label: 'New Lead',     color: 'text-slate-600 dark:text-slate-400',    bg: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'contacted',     label: 'Contacted',    color: 'text-zinc-700 dark:text-zinc-350',      bg: 'bg-zinc-100 dark:bg-zinc-800' },
  { id: 'proposal_sent', label: 'Proposal',     color: 'text-slate-900 dark:text-slate-150',    bg: 'bg-slate-200 dark:bg-slate-700' },
  { id: 'negotiation',   label: 'Negotiating',  color: 'text-black dark:text-white font-semibold', bg: 'bg-slate-300 dark:bg-slate-650' },
  { id: 'won',           label: 'Won Deal',     color: 'text-white bg-slate-900 dark:text-black dark:bg-white font-bold', bg: 'bg-slate-900 dark:bg-white' },
  { id: 'retainer',      label: 'Retainer',     color: 'text-white bg-zinc-800 dark:text-black dark:bg-zinc-300 font-bold', bg: 'bg-zinc-800 dark:bg-zinc-300' },
  { id: 'lost',          label: 'Lost Deal',    color: 'text-slate-500 bg-slate-100 dark:bg-slate-800', bg: 'bg-slate-100 dark:bg-slate-800' },
];

export default function LeadsPage() {
  const { activeWorkspace, getTabAccess } = useWorkspace();
  const isReadOnly = getTabAccess('leads') === 'view';
  const confirm = useConfirm();
  
  // Data lists
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Lead selection & Modal UI
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore session cache once mounted in browser to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const cachedLeads = sessionStorage.getItem('cached_leads_list');
        if (cachedLeads) {
          const list: Lead[] = JSON.parse(cachedLeads);
          setLeads(list);
          const savedId = sessionStorage.getItem('last_active_lead_id');
          if (savedId) {
            const found = list.find(l => l.id === savedId);
            if (found) setSelectedLead(found);
          }
          setLoading(false);
        }
        const cachedClients = sessionStorage.getItem('cached_leads_clients');
        if (cachedClients) setClients(JSON.parse(cachedClients));
        const cachedProjects = sessionStorage.getItem('cached_leads_projects');
        if (cachedProjects) setProjects(JSON.parse(cachedProjects));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      try {
        if (selectedLead) {
          sessionStorage.setItem('last_active_lead_id', selectedLead.id);
        } else {
          sessionStorage.removeItem('last_active_lead_id');
        }
      } catch {}
    }
  }, [selectedLead?.id, mounted]);

  // Add / Edit Lead states
  const [leadTargetType, setLeadTargetType] = useState<'existing_client' | 'new_prospect'>('existing_client');
  const [leadTitle, setLeadTitle] = useState('');
  const [leadClientId, setLeadClientId] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [prospectContactPerson, setProspectContactPerson] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');
  const [leadValue, setLeadValue] = useState('');
  const [leadStage, setLeadStage] = useState<Lead['stage']>('lead');
  const [leadFollowUp, setLeadFollowUp] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [savingLead, setSavingLead] = useState(false);

  // Convert to Client modal & toast states
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [convertCompanyName, setConvertCompanyName] = useState('');
  const [convertContactPerson, setConvertContactPerson] = useState('');
  const [convertEmail, setConvertEmail] = useState('');
  const [convertPhone, setConvertPhone] = useState('');
  const [converting, setConverting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const fetchData = async () => {
    if (!activeWorkspace) return;
    const hasCache = typeof window !== 'undefined' && !!sessionStorage.getItem('cached_leads_list');
    if (!hasCache) setLoading(true);
    try {
      const [leadsRes, clientsRes, projectsRes] = await Promise.all([
        fetch(`/api/crm/leads?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/crm/clients?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/projects?workspaceId=${activeWorkspace.id}`),
      ]);
      if (leadsRes.ok) {
        const ld = await leadsRes.json();
        setLeads(ld);
        try { sessionStorage.setItem('cached_leads_list', JSON.stringify(ld)); } catch {}

        const savedId = typeof window !== 'undefined' ? sessionStorage.getItem('last_active_lead_id') : null;
        setSelectedLead(prev => {
          if (prev) return ld.find((l: any) => l.id === prev.id) || null;
          if (savedId) return ld.find((l: any) => l.id === savedId) || null;
          return null;
        });
      }
      if (clientsRes.ok) {
        const cl = await clientsRes.json();
        const validClients = Array.isArray(cl) ? cl : [];
        setClients(validClients);
        try { sessionStorage.setItem('cached_leads_clients', JSON.stringify(validClients)); } catch {}
      }
      if (projectsRes.ok) {
        const pr = await projectsRes.json();
        const validProjects = Array.isArray(pr) ? pr : [];
        setProjects(validProjects);
        try { sessionStorage.setItem('cached_leads_projects', JSON.stringify(validProjects)); } catch {}
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeWorkspace]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddLeadModal(false);
        setLeadToConvert(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isProspectLead = (lead: Lead | null | undefined): boolean => {
    if (!lead) return false;
    if (lead.leadType === 'new_prospect') return true;
    if (lead.leadType === 'existing_client') return false;
    return !lead.clientId && !!lead.companyName;
  };

  const getClientName = (lead: Lead) => {
    if (lead.companyName) return lead.companyName;
    if (lead.clientId) {
      const cl = clients.find(c => c.id === lead.clientId);
      return cl?.companyName || cl?.contactPerson || '—';
    }
    return 'New Prospect';
  };

  // Lead Handlers (Create / Update / Delete)
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !leadTitle.trim()) return;

    if (leadTargetType === 'existing_client' && !leadClientId) {
      alert('Please select an existing client');
      return;
    }
    if (leadTargetType === 'new_prospect' && !prospectName.trim()) {
      alert('Please provide an entity or prospect name');
      return;
    }

    setSavingLead(true);
    try {
      const isEdit = !!selectedLead;
      const res = await fetch('/api/crm/leads', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedLead?.id,
          workspaceId: activeWorkspace.id,
          leadType: leadTargetType,
          clientId: leadTargetType === 'existing_client' ? leadClientId : null,
          companyName: leadTargetType === 'new_prospect' ? prospectName.trim() : undefined,
          contactPerson: leadTargetType === 'new_prospect' ? prospectContactPerson.trim() : undefined,
          email: leadTargetType === 'new_prospect' ? prospectEmail.trim() : undefined,
          phone: leadTargetType === 'new_prospect' ? prospectPhone.trim() : undefined,
          title: leadTitle.trim(),
          value: parseFloat(leadValue) || 0,
          currency: 'INR',
          stage: leadStage,
          notes: leadNotes.trim(),
          nextFollowUp: leadFollowUp || undefined
        })
      });
      if (res.ok) {
        setShowAddLeadModal(false);
        setSelectedLead(null);
        setLeadTitle(''); setLeadClientId(''); setLeadValue('');
        setProspectName(''); setProspectContactPerson(''); setProspectEmail(''); setProspectPhone('');
        setLeadStage('lead'); setLeadFollowUp(''); setLeadNotes('');
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingLead(false);
    }
  };

  const startConvertToClient = (lead: Lead) => {
    // Only new prospects can be marked as clients. Existing clients cannot be marked as clients.
    if (!isProspectLead(lead)) return;

    const targetName = lead.companyName || lead.title;
    const targetPerson = lead.contactPerson || targetName;
    const targetEmail = lead.email || '';
    const targetPhone = lead.phone || '';

    setLeadToConvert(lead);
    setConvertCompanyName(targetName);
    setConvertContactPerson(targetPerson);
    setConvertEmail(targetEmail);
    setConvertPhone(targetPhone);
  };

  const handleConfirmConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !leadToConvert) return;
    setConverting(true);
    try {
      const res = await fetch('/api/crm/leads/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: leadToConvert.id,
          workspaceId: activeWorkspace.id,
          companyName: convertCompanyName.trim(),
          contactPerson: convertContactPerson.trim(),
          email: convertEmail.trim(),
          phone: convertPhone.trim()
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Remove lead from state so it never shows up in leads and no longer exists in leads category
        setLeads(prev => prev.filter(l => l.id !== leadToConvert.id));
        if (selectedLead?.id === leadToConvert.id) {
          setSelectedLead(null);
          setShowAddLeadModal(false);
        }
        setLeadToConvert(null);
        setToastMessage(`"${convertCompanyName || leadToConvert.title}" is now an official Client! Moved out of Leads.`);
        await fetchData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to convert lead to client');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during conversion');
    } finally {
      setConverting(false);
    }
  };

  const handleMoveStage = async (lead: Lead, newStage: Lead['stage']) => {
    if (!activeWorkspace) return;
    try {
      await fetch('/api/crm/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, workspaceId: activeWorkspace.id, stage: newStage }),
      });
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage } : l));
      if (selectedLead?.id === lead.id) {
        setSelectedLead(prev => prev ? { ...prev, stage: newStage } : null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!activeWorkspace) return;
    const ok = await confirm({
      title: 'Delete Sales Lead',
      message: 'Are you sure you want to delete this sales lead? This action cannot be undone.',
      confirmText: 'Delete Lead',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await fetch(`/api/crm/leads?id=${leadId}&workspaceId=${activeWorkspace.id}`, { method: 'DELETE' });
      if (selectedLead?.id === leadId) setSelectedLead(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const openAddLead = () => {
    setSelectedLead(null);
    setLeadTargetType('existing_client');
    setLeadTitle('');
    const activeClient = clients.find(c => c.status !== 'inactive');
    setLeadClientId(activeClient?.id || clients[0]?.id || '');
    setProspectName('');
    setProspectContactPerson('');
    setProspectEmail('');
    setProspectPhone('');
    setLeadValue('');
    setLeadStage('lead');
    setLeadFollowUp('');
    setLeadNotes('');
    setShowAddLeadModal(true);
  };

  const openEditLead = (lead: Lead) => {
    setSelectedLead(lead);
    const isProspect = lead.leadType === 'new_prospect' || (!lead.clientId && !!lead.companyName);
    setLeadTargetType(isProspect ? 'new_prospect' : 'existing_client');
    setLeadTitle(lead.title);
    setLeadClientId(lead.clientId || (clients.find(c => c.status !== 'inactive')?.id || clients[0]?.id || ''));
    setProspectName(lead.companyName || '');
    setProspectContactPerson(lead.contactPerson || '');
    setProspectEmail(lead.email || '');
    setProspectPhone(lead.phone || '');
    setLeadValue(lead.value !== undefined ? String(lead.value) : '');
    setLeadStage(lead.stage);
    setLeadFollowUp(lead.nextFollowUp || '');
    setLeadNotes(lead.notes || '');
    setShowAddLeadModal(true);
  };

  // Sales Stats Computations
  const stats = useMemo(() => {
    const totalLeads = leads.length;
    const wonLeads = leads.filter(l => l.stage === 'won' || l.stage === 'retainer');
    const lostLeads = leads.filter(l => l.stage === 'lost');
    const pipelineLeads = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost' && l.stage !== 'retainer');

    const wonVal = wonLeads.reduce((sum, l) => sum + l.value, 0);
    const pipeVal = pipelineLeads.reduce((sum, l) => sum + l.value, 0);
    
    const winRate = totalLeads > 0 
      ? Math.round((wonLeads.length / (wonLeads.length + lostLeads.length || 1)) * 100) 
      : 0;

    return {
      totalLeads,
      wonVal,
      pipeVal,
      winRate
    };
  }, [leads]);

  // Group deals by stage
  const leadsByStage = useMemo(() => {
    return {
      lead:          leads.filter(l => l.stage === 'lead'),
      contacted:     leads.filter(l => l.stage === 'contacted'),
      proposal_sent: leads.filter(l => l.stage === 'proposal_sent'),
      negotiation:   leads.filter(l => l.stage === 'negotiation'),
      won:           leads.filter(l => l.stage === 'won' || l.stage === 'retainer'),
      lost:          leads.filter(l => l.stage === 'lost')
    };
  }, [leads]);

  const checkIsPastDue = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

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
    <div className="p-4 md:p-8 h-[calc(100vh-4rem)] flex flex-col gap-6 max-w-7xl mx-auto overflow-hidden text-slate-800 dark:text-slate-200">
      
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Target className="h-5 w-5 text-gray-950 dark:text-gray-100" />
              Leads & Sales Pipeline
            </h1>
            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 rounded-full">
              CRM Pipeline
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Track prospective client pipelines, deal stage progression, active value, and won revenue.
          </p>
        </div>
      </div>

      {/* SALES DEALS PIPELINE WORKSPACE */}
      <div className="flex-1 flex flex-col gap-6 min-h-0">
          
          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
              <div className="h-10 w-10 bg-slate-100 dark:bg-slate-805 rounded-xl flex items-center justify-center shrink-0">
                <Target className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Deals</p>
                <p className="text-base font-black mt-0.5">{stats.totalLeads}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
              <div className="h-10 w-10 bg-slate-100 dark:bg-slate-805 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Won Revenue</p>
                <p className="text-base font-black mt-0.5">₹{stats.wonVal.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
              <div className="h-10 w-10 bg-slate-100 dark:bg-slate-805 rounded-xl flex items-center justify-center shrink-0">
                <DollarSign className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Pipeline</p>
                <p className="text-base font-black mt-0.5">₹{stats.pipeVal.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
              <div className="h-10 w-10 bg-slate-100 dark:bg-slate-805 rounded-xl flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Closing Win Rate</p>
                <p className="text-base font-black mt-0.5">{stats.winRate}%</p>
              </div>
            </div>
          </div>

          {/* Kanban workspace board */}
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl flex flex-col min-h-0 shadow-sm relative">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sales Pipeline Board</span>
              {!isReadOnly && (
                <button
                  onClick={openAddLead}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-wider rounded-xl shadow-sm transition-all"
                >
                  <Plus className="h-3.5 w-3.5" /> Add deal
                </button>
              )}
            </div>

            {/* Kanban Columns */}
            <div className="flex-1 overflow-x-auto p-4 flex gap-4 min-h-0 items-start">
              {(Object.keys(leadsByStage) as (keyof typeof leadsByStage)[]).map(stageKey => {
                const stageTasks = leadsByStage[stageKey];
                const stageInfo = STAGES.find(s => s.id === stageKey) || STAGES[0];
                return (
                  <div key={stageKey} className="w-64 shrink-0 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/40 dark:border-slate-805 p-3 rounded-2xl flex flex-col max-h-full">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between shrink-0 mb-3 px-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-650 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          stageKey === 'lead' ? 'bg-slate-405' :
                          stageKey === 'contacted' ? 'bg-zinc-550' :
                          stageKey === 'proposal_sent' ? 'bg-slate-900 dark:bg-white' : 'bg-black'
                        }`} />
                        {stageInfo.label}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 rounded-lg">
                        {stageTasks.length}
                      </span>
                    </div>

                    {/* Leads Cards */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 no-scrollbar">
                      {stageTasks.map(lead => {
                        const isPastDue = checkIsPastDue(lead.nextFollowUp);
                        return (
                          <div
                            key={lead.id}
                            onClick={() => openEditLead(lead)}
                            className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-xl hover:shadow-md transition-all cursor-pointer relative group"
                          >
                            <div className="text-xs font-semibold leading-tight pr-5">{lead.title}</div>
                            
                            {/* Entity & Badge Row */}
                            <div className="flex items-center justify-between gap-1 mt-2 text-[9px]">
                              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 min-w-0">
                                <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="truncate font-medium">{getClientName(lead)}</span>
                              </div>
                              {lead.leadType === 'new_prospect' || (!lead.clientId && !!lead.companyName) ? (
                                <span className="shrink-0 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                                  Prospect
                                </span>
                              ) : (
                                <span className="shrink-0 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50">
                                  Client
                                </span>
                              )}
                            </div>

                            {/* Info row */}
                            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 pt-2.5 mt-3 text-[9px]">
                              {lead.nextFollowUp ? (
                                <span className={`flex items-center gap-0.5 font-bold ${isPastDue ? 'text-red-500' : 'text-slate-400'}`}>
                                  <Calendar className="h-3 w-3" />
                                  {lead.nextFollowUp}
                                </span>
                              ) : <span />}

                              <span className="font-bold text-slate-900 dark:text-slate-100">₹{lead.value.toLocaleString()}</span>
                            </div>

                            {/* Quick Mover Stage Arrows (Left & Right Corners) + Mark as Client in Center */}
                            {!isReadOnly && (
                              <div className="flex items-center justify-between mt-2.5 pt-0.5">
                                {/* Left Arrow at left side corner */}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const order: Lead['stage'][] = ['lead', 'contacted', 'proposal_sent', 'negotiation', 'won', 'lost'];
                                    const curIdx = order.indexOf(lead.stage);
                                    const prevIdx = (curIdx - 1 + order.length) % order.length;
                                    await handleMoveStage(lead, order[prevIdx]);
                                  }}
                                  className="h-6 w-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center cursor-pointer shrink-0"
                                  title="Move to previous stage"
                                >
                                  <ArrowLeft className="h-3 w-3" />
                                </button>

                                {/* Center: Mark as Client button — ONLY shown for new prospects who are not yet clients */}
                                {isProspectLead(lead) ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startConvertToClient(lead);
                                    }}
                                    className="h-6 px-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-400 dark:hover:border-emerald-600 shadow-2xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all flex items-center gap-1 text-[9.5px] font-bold cursor-pointer"
                                    title="Mark as Client (Converts new prospect to official Client and moves out of Leads)"
                                  >
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                    <span>Mark as Client</span>
                                  </button>
                                ) : (
                                  <div />
                                )}

                                {/* Right Arrow at right side corner */}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const order: Lead['stage'][] = ['lead', 'contacted', 'proposal_sent', 'negotiation', 'won', 'lost'];
                                    const curIdx = order.indexOf(lead.stage);
                                    const nextIdx = (curIdx + 1) % order.length;
                                    await handleMoveStage(lead, order[nextIdx]);
                                  }}
                                  className="h-6 w-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-center cursor-pointer shrink-0"
                                  title="Move to next stage"
                                >
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              </div>
                            )}

                            {/* Trash button */}
                            {!isReadOnly && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      {/* Add / Edit Lead Modal */}
      {showAddLeadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-xs overflow-hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddLeadModal(false); }}
        >
          <div className="relative w-full max-w-lg max-h-[88vh] bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  {selectedLead ? 'Edit Lead Deal' : 'Add New Lead Deal'}
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Track sales stages, negotiation values, and follow-up timelines
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddLeadModal(false)}
                className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveLead} className="flex-1 flex flex-col min-h-0">
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Deal Title *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Mobile App Dev Deal"
                    value={leadTitle}
                    onChange={e => setLeadTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
                  />
                </div>

                {/* Lead Target Type Selection (Segmented switcher) */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                    Lead For *
                  </label>
                  <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => setLeadTargetType('existing_client')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        leadTargetType === 'existing_client'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Existing Client
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeadTargetType('new_prospect')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        leadTargetType === 'new_prospect'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      New Prospect / Entity
                    </button>
                  </div>
                </div>

                {/* Conditional Client or Prospect inputs */}
                {leadTargetType === 'existing_client' ? (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Client *</label>
                    <select
                      value={leadClientId}
                      onChange={e => setLeadClientId(e.target.value)}
                      required={leadTargetType === 'existing_client'}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>Select a client...</option>
                      {clients.filter(c => c.status !== 'inactive').map(c => (
                        <option key={c.id} value={c.id}>{c.companyName}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                    <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50/90 border border-amber-200/70 p-2.5 rounded-xl font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.2" />
                      <span>This entity is recorded strictly as a Lead prospect and will <strong>NOT</strong> appear in Clients until you mark it as a Client.</span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        Entity / Company / Person Name *
                      </label>
                      <input
                        required={leadTargetType === 'new_prospect'}
                        type="text"
                        placeholder="e.g. Acme Labs or John Doe"
                        value={prospectName}
                        onChange={e => setProspectName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                          Contact Person
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Sarah Connor"
                          value={prospectContactPerson}
                          onChange={e => setProspectContactPerson(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          placeholder="e.g. sarah@acme.com"
                          value={prospectEmail}
                          onChange={e => setProspectEmail(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. +91 98765 43210"
                        value={prospectPhone}
                        onChange={e => setProspectPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Deal Value (₹)</label>
                    <input
                      type="number"
                      value={leadValue}
                      onChange={e => setLeadValue(e.target.value)}
                      placeholder="e.g. 50000"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Sales Stage</label>
                    <select
                      value={leadStage}
                      onChange={e => setLeadStage(e.target.value as Lead['stage'])}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
                    >
                      {STAGES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Next Follow-Up</label>
                  <input
                    type="date"
                    value={leadFollowUp}
                    onChange={e => setLeadFollowUp(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Notes</label>
                  <textarea
                    value={leadNotes}
                    onChange={e => setLeadNotes(e.target.value)}
                    placeholder="Private negotiation details..."
                    rows={3}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900 transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 px-6 py-3.5 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {selectedLead && isProspectLead(selectedLead) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddLeadModal(false);
                        startConvertToClient(selectedLead);
                      }}
                      className="px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Mark as Client & Close Lead
                    </button>
                  )}
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Press <kbd className="font-mono bg-white px-1.5 py-0.5 border border-slate-200 rounded text-[10px] shadow-2xs">Esc</kbd> to dismiss
                  </span>
                </div>
                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowAddLeadModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingLead}
                    className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingLead ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Deal'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Convert Lead to Client Confirmation Modal */}
      {leadToConvert && (
        <div
          className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setLeadToConvert(null); }}
        >
          <div className="relative w-full max-w-md bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Mark as Client
                </h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Convert this deal into an official Client and remove it from Leads
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeadToConvert(null)}
                className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form onSubmit={handleConfirmConvert} className="p-6 space-y-3.5 text-xs">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-emerald-850 text-[11px] leading-relaxed">
                <strong>Important:</strong> Once marked as a client, this entity moves to the <strong>Clients</strong> directory and will <strong>no longer exist in the Leads category</strong>.
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Company / Client Name *</label>
                <input
                  required
                  type="text"
                  value={convertCompanyName}
                  onChange={e => setConvertCompanyName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={convertContactPerson}
                  onChange={e => setConvertContactPerson(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={convertEmail}
                    onChange={e => setConvertEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={convertPhone}
                    onChange={e => setConvertPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLeadToConvert(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={converting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Confirm & Move to Clients
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-70 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-medium border border-slate-800 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
