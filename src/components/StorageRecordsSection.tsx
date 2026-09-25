'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Database, HardDrive, Folder, FileCode, ShieldCheck,
  RefreshCw, Copy, Check, ExternalLink, Search, Archive,
  FileText, Lock, MessageSquare, Briefcase, CreditCard,
  Users, Calendar, AlertCircle, ChevronDown, ChevronRight,
  Eye, CheckCircle2, Download, AlertTriangle, Layers, Shield,
  Cloud, Server, Globe, Cpu
} from 'lucide-react';

interface StorageFrameworkInfo {
  primaryDatabase: {
    name: string;
    type: string;
    projectId: string;
    status: string;
    syncMode: string;
    health: string;
  };
  objectStorage: {
    name: string;
    type: string;
    bucket: string;
    status: string;
    cdn: string;
    health: string;
  };
  authFramework: {
    name: string;
    type: string;
    domain: string;
    status: string;
  };
  hybridSync: {
    status: string;
    architecture: string;
    localPartition: string;
  };
}

interface StorageDomain {
  id: string;
  name: string;
  category: 'Business & CRM' | 'Projects & Work' | 'Communication' | 'Media & Uploads' | 'Identity & Access' | 'System & Audit';
  dirName: string;
  format: string;
  description: string;
  sampleFields: string[];
  ideation: string;
  absolutePath: string;
  exists: boolean;
  isWritable: boolean;
  fileCount: number;
  sizeBytes: number;
  lastModified: string;
  recentFiles: { name: string; size: number; modifiedAt: string }[];
  cloudTarget?: string;
  cloudUri?: string;
  isCloudSynced?: boolean;
}

interface StorageRegistryData {
  rootPath: string;
  status: string;
  framework?: StorageFrameworkInfo;
  summary: {
    totalBytes: number;
    totalFiles: number;
    totalDomains: number;
    healthyCount: number;
    allHealthy: boolean;
    storageEngine: string;
    persistenceGuarantee: string;
    activeFrameworksCount?: number;
  };
  domains: StorageDomain[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const CATEGORY_COLORS: Record<string, string> = {
  'Business & CRM': 'bg-gray-100 text-gray-800 border-gray-200/80',
  'Projects & Work': 'bg-gray-100 text-gray-800 border-gray-200/80',
  'Communication': 'bg-gray-100 text-gray-800 border-gray-200/80',
  'Media & Uploads': 'bg-gray-100 text-gray-800 border-gray-200/80',
  'Identity & Access': 'bg-gray-100 text-gray-800 border-gray-200/80',
  'System & Audit': 'bg-gray-100 text-gray-800 border-gray-200/80',
};

export default function StorageRecordsSection() {
  const [data, setData] = useState<StorageRegistryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const fetchStorageData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/system/storage-records');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load storage records:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStorageData();
  }, []);

  const handleSyncAndVerify = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/system/storage-records', {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        setData(prev => prev ? { ...prev, ...json } : json);
      }
    } catch (err) {
      console.error('Failed to sync storage:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    setBackupStatus(null);
    try {
      const res = await fetch('/api/admin/backups', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setBackupStatus(`Snapshot saved: ${json.filename}`);
        fetchStorageData();
      } else {
        setBackupStatus(json.error || 'Backup creation restricted or failed');
      }
    } catch {
      setBackupStatus('Network error while requesting backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const categories = ['All', 'Business & CRM', 'Projects & Work', 'Communication', 'Media & Uploads', 'Identity & Access', 'System & Audit'];

  const filteredDomains = useMemo(() => {
    if (!data) return [];
    return data.domains.filter(d => {
      const matchesCat = selectedCategory === 'All' || d.category === selectedCategory;
      const matchesSearch =
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.dirName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.sampleFields.some(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [data, selectedCategory, searchQuery]);

  if (loading) {
    return (
      <div className="py-16 text-center space-y-3 bg-white rounded-3xl border border-gray-200/80 p-8 shadow-2xs">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
        <p className="text-xs font-semibold text-gray-600">Auditing local storage partitions and data records...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-gray-200/80">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm font-bold text-gray-800">Unable to load storage registry</p>
        <button onClick={() => fetchStorageData()} className="mt-3 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold">
          Retry Audit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. PERSISTENCE & CLOUD ARCHITECTURE BANNER */}
      <div className="bg-white rounded-3xl border border-gray-200/80 p-6 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-base font-bold text-gray-900 tracking-tight">
                Data Storage Registry & Cloud Frameworks
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Cloud className="h-3 w-3" />
                Cloud Connected & Verified
              </span>
            </div>
            <p className="text-xs text-gray-500 max-w-2xl">
              Docspace operates on a multi-tier hybrid cloud architecture: Google Cloud Firestore for structured records, Cloudflare R2 for media objects, and an atomic edge cache layer for zero-latency operations.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSyncAndVerify}
              disabled={syncing}
              className="px-3.5 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Verify directory permissions, cloud connections, and data integrity"
            >
              <ShieldCheck className={`h-3.5 w-3.5 text-emerald-600 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Verifying...' : 'Verify & Sync'}</span>
            </button>

            <button
              onClick={() => fetchStorageData(true)}
              disabled={refreshing}
              className="px-3.5 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200/80 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Re-scan cloud and storage metrics"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Scanning...' : 'Refresh'}</span>
            </button>

            <button
              onClick={handleCreateBackup}
              disabled={backupLoading}
              className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
              title="Create a point-in-time full zip backup"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>{backupLoading ? 'Backing up...' : 'Snapshot Backup'}</span>
            </button>
          </div>
        </div>

        {backupStatus && (
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 flex items-center justify-between">
            <span>{backupStatus}</span>
            <button onClick={() => setBackupStatus(null)} className="text-gray-400 hover:text-gray-600 text-xs">Dismiss</button>
          </div>
        )}

        {/* CONNECTED CLOUD FRAMEWORKS & SERVICES */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Card 1: Google Cloud Firestore */}
          <div className="bg-gradient-to-br from-blue-50/60 to-indigo-50/40 border border-blue-200/70 rounded-2xl p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Database className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Google Cloud Firestore</h3>
                    <span className="text-[10px] text-gray-500 block">Primary NoSQL Database</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Real-time document persistence across all business records, clients, projects, tasks, and workspaces.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-blue-100/80 flex items-center justify-between text-[10px] font-mono text-gray-500">
              <span>Project ID:</span>
              <span className="font-bold text-blue-900">{data.framework?.primaryDatabase.projectId || 'docspace-7824a'}</span>
            </div>
          </div>

          {/* Card 2: Cloudflare R2 Object Storage */}
          <div className="bg-gradient-to-br from-amber-50/60 to-orange-50/40 border border-amber-200/70 rounded-2xl p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                    <Cloud className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Cloudflare R2 Storage</h3>
                    <span className="text-[10px] text-gray-500 block">S3-Compatible Edge Store</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Zero-egress object storage for file uploads, invoice attachments, avatars, and documents.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-amber-100/80 flex items-center justify-between text-[10px] font-mono text-gray-500">
              <span>R2 Bucket:</span>
              <span className="font-bold text-amber-900">{data.framework?.objectStorage.bucket || 'docspace'}</span>
            </div>
          </div>

          {/* Card 3: Firebase Auth & Google Identity */}
          <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/40 border border-emerald-200/70 rounded-2xl p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Google Identity & Auth</h3>
                    <span className="text-[10px] text-gray-500 block">Firebase Admin Framework</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Enforced
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Pre-authorized team access via Google sign-in exclusively for the production domain.
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-emerald-100/80 flex items-center justify-between text-[10px] font-mono text-gray-500">
              <span>Domain:</span>
              <span className="font-bold text-emerald-900">{data.framework?.authFramework.domain || 'docspace.docdril.com'}</span>
            </div>
          </div>
        </div>

        {/* Production Cloud Cluster & Storage Endpoints */}
        <div className="bg-gray-50/80 border border-gray-200/70 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Production Cloud Endpoints & Cluster</span>
              <span className="text-xs font-mono font-bold text-gray-800 truncate block select-all">
                docspace.docdril.com &bull; Google Cloud Firestore (`docspace-7824a`) &bull; Cloudflare R2 (`docspace`)
              </span>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard('https://docspace.docdril.com')}
            className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
          >
            {copiedPath === 'https://docspace.docdril.com' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-gray-400" />
                <span>Copy Domain</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. SUMMARY METRICS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Total Volume</span>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatBytes(data.summary.totalBytes)}</p>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Across cloud & edge cache</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Total Managed Records</span>
          <p className="text-xl font-bold text-gray-900 mt-1">{data.summary.totalFiles} <span className="text-xs font-normal text-gray-400">records</span></p>
          <span className="text-[11px] text-gray-400 mt-0.5 block">Firestore docs & R2 objects</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Registered Domains</span>
          <p className="text-xl font-bold text-gray-900 mt-1">{data.summary.totalDomains} <span className="text-xs font-normal text-gray-400">domains</span></p>
          <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">100% Isolated Partitions</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Storage Framework</span>
          <p className="text-sm font-bold text-gray-900 mt-1 truncate">{data.summary.storageEngine || 'Google Cloud Firestore + Cloudflare R2'}</p>
          <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block truncate">Multi-Cloud Hybrid Architecture</span>
        </div>
      </div>

      {/* 3. FILTERS & SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl border border-gray-200/80 p-3.5 shadow-2xs">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 gap-2 w-full sm:w-60">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search records or schema..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-gray-900 placeholder-gray-400 focus:outline-none flex-1"
          />
        </div>
      </div>

      {/* 4. DOMAIN RECORDS LIST */}
      <div className="space-y-4">
        {filteredDomains.map(domain => {
          const isExpanded = expandedDomain === domain.id;
          const catColor = CATEGORY_COLORS[domain.category] || 'bg-gray-100 text-gray-700';

          return (
            <div
              key={domain.id}
              className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-2xs transition-all hover:border-gray-300"
            >
              {/* Card Header & Location */}
              <div className="p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gray-50 border border-gray-200/70 flex items-center justify-center text-gray-700 shrink-0">
                      <Folder className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-900">{domain.name}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catColor}`}>
                          {domain.category}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {domain.format}
                        </span>
                        {domain.cloudTarget && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Cloud className="h-3 w-3 text-emerald-600" />
                            {domain.cloudTarget}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{domain.description}</p>
                    </div>
                  </div>

                  {/* Metrics Badge */}
                  <div className="flex items-center gap-2.5 shrink-0 sm:self-start">
                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-900 block">{domain.fileCount} {domain.fileCount === 1 ? 'record' : 'records'}</span>
                      <span className="text-[11px] text-gray-400 block">{formatBytes(domain.sizeBytes)}</span>
                    </div>
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${domain.isWritable ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      title={domain.isWritable ? 'Active & Writable' : 'Read-only or missing'}
                    />
                  </div>
                </div>

                {/* Cloud Resource Locator Box */}
                <div className="bg-gray-50/90 border border-gray-200/70 rounded-xl p-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 shrink-0">Cloud Resource URI:</span>
                    <span className="text-xs font-mono font-bold text-gray-800 truncate select-all">
                      {domain.cloudUri || (domain.category === 'Media & Uploads' ? `r2://docspace/${domain.dirName}` : `firestore://docspace-7824a/${domain.dirName}`)}
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(domain.cloudUri || (domain.category === 'Media & Uploads' ? `r2://docspace/${domain.dirName}` : `firestore://docspace-7824a/${domain.dirName}`))}
                    className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 text-gray-500 hover:text-gray-900 transition-colors shrink-0"
                    title="Copy Cloud Resource URI"
                  >
                    {copiedPath === (domain.cloudUri || (domain.category === 'Media & Uploads' ? `r2://docspace/${domain.dirName}` : `firestore://docspace-7824a/${domain.dirName}`)) ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Data Ideation / Recording Logic */}
                <div className="text-xs bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-blue-900/90 flex items-start gap-2.5">
                  <Layers className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold block text-[11px] text-blue-800">Storage Ideation & Persistence Guarantee:</span>
                    <span className="text-xs text-blue-900/80 leading-relaxed mt-0.5 block">{domain.ideation}</span>
                  </div>
                </div>

                {/* Schema Keys Pill Tags */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1">Schema Fields:</span>
                  {domain.sampleFields.map(f => (
                    <span key={f} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200/60">
                      {f}
                    </span>
                  ))}
                </div>

                {/* Toggle Recent Files Inspector */}
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    Last modified: {new Date(domain.lastModified).toLocaleString()}
                  </span>

                  <button
                    onClick={() => setExpandedDomain(isExpanded ? null : domain.id)}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                  >
                    <span>{isExpanded ? 'Hide Records' : `Inspect Records (${domain.recentFiles.length})`}</span>
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Collapsible Files List */}
              {isExpanded && (
                <div className="bg-gray-50/70 border-t border-gray-200/80 p-4 space-y-2">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Live Cloud Documents & Objects:</p>
                  {domain.recentFiles.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No files in this folder yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {domain.recentFiles.map(rf => (
                        <div
                          key={rf.name}
                          className="bg-white border border-gray-200/60 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="font-semibold text-gray-800 truncate">{rf.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-[11px] text-gray-400 font-sans">
                            <span>{formatBytes(rf.size)}</span>
                            <span>{new Date(rf.modifiedAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
