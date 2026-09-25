'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Users, HardDrive, Database, Shield, Trash2, 
  Download, RotateCcw, AlertTriangle, Search, Loader2, Check 
} from 'lucide-react';
import { User } from '@/context/AuthContext';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  onRefreshUsers: () => void;
}

export default function AdminModal({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  onRefreshUsers
}: AdminModalProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'storage' | 'backups' | 'logs'>('users');
  const [stats, setStats] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);

  // Filters for logs
  const [logQuery, setLogQuery] = useState('');
  const [logLevel, setLogLevel] = useState('');
  const [logCategory, setLogCategory] = useState('');
  const [logPage, setLogPage] = useState(0);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser.role === 'admin') {
      fetchStats();
      fetchBackups();
      fetchLogs();
    }
  }, [isOpen, activeTab, currentUser, logPage, logLevel, logCategory]);

  if (!isOpen || currentUser.role !== 'admin') return null;

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {}
  };

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/admin/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(data);
      }
    } catch (err) {}
  };

  const fetchLogs = async () => {
    try {
      const limit = 30;
      const offset = logPage * limit;
      let url = `/api/admin/logs?limit=${limit}&offset=${offset}`;
      if (logQuery) url += `&query=${encodeURIComponent(logQuery)}`;
      if (logLevel) url += `&level=${logLevel}`;
      if (logCategory) url += `&category=${logCategory}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotalLogs(data.total || 0);
      }
    } catch (err) {}
  };

  // Actions for users
  const handleToggleDisabled = async (userId: string, currentVal: boolean) => {
    setActionLoading(`user-status-${userId}`);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, disabled: !currentVal })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user');
      }
      onRefreshUsers();
      fetchStats();
      setSuccess(`User account ${!currentVal ? 'disabled' : 'enabled'} successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    setActionLoading(`user-role-${userId}`);
    setError(null);
    try {
      const nextRole = currentRole === 'admin' ? 'user' : 'admin';
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: nextRole })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user role');
      }
      onRefreshUsers();
      setSuccess(`User role changed to ${nextRole}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently delete this user? All their messages will remain, but their account will be destroyed.')) return;
    
    setActionLoading(`user-delete-${userId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      onRefreshUsers();
      fetchStats();
      setSuccess('User deleted permanently');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Actions for backups
  const handleCreateBackup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/backups', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create backup');
      }
      fetchBackups();
      fetchStats();
      setSuccess('Backup created successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(`Are you absolutely sure you want to restore the backup "${filename}"? This will overwrite all current users, settings, and message files with the backup state. The application may reload.`)) return;

    setActionLoading(`backup-restore-${filename}`);
    setError(null);
    try {
      const res = await fetch('/api/admin/backups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Restore failed');
      }
      setSuccess('Backup restored successfully! Refreshing details...');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"?`)) return;

    setActionLoading(`backup-delete-${filename}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/backups?filename=${filename}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      fetchBackups();
      fetchStats();
      setSuccess('Backup file deleted');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Helper to format bytes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl glass border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-500" />
              DocSpace Admin Console
            </h3>
            <p className="text-xs text-slate-400">System management, analytics, databases, and logs</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30">
          {[
            { id: 'users', label: 'Users Management', icon: Users },
            { id: 'storage', label: 'Storage Usage', icon: HardDrive },
            { id: 'backups', label: 'Backup System', icon: Database },
            { id: 'logs', label: 'System Logs', icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-5 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white/50 dark:bg-slate-900/20'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-2">
              <Check className="h-4 w-4" />
              {success}
            </div>
          )}

          {/* TAB: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Registered Accounts</h4>
              
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Registered</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-950 divide-y divide-slate-200 dark:divide-slate-800">
                      {allUsers.map((u) => (
                        <tr key={u.id} className={u.disabled ? 'opacity-60 bg-slate-50/20' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center overflow-hidden">
                                {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : u.displayName[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{u.displayName}</div>
                                <div className="text-xs text-slate-400">@{u.username}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xxs font-bold uppercase ${
                              u.role === 'admin' 
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300' 
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`h-2.5 w-2.5 rounded-full inline-block mr-2 ${
                              u.disabled ? 'bg-red-500' : u.status === 'online' ? 'bg-green-500' : 'bg-slate-400'
                            }`} />
                            <span className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                              {u.disabled ? 'Disabled' : u.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium space-x-2">
                            {u.id !== currentUser.id && (
                              <>
                                <button
                                  onClick={() => handleToggleRole(u.id, u.role)}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                                  disabled={actionLoading === `user-role-${u.id}`}
                                >
                                  Role
                                </button>
                                <button
                                  onClick={() => handleToggleDisabled(u.id, !!u.disabled)}
                                  className="text-amber-600 hover:underline disabled:opacity-50"
                                  disabled={actionLoading === `user-status-${u.id}`}
                                >
                                  {u.disabled ? 'Enable' : 'Disable'}
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="text-red-500 hover:text-red-700 disabled:opacity-50"
                                  disabled={actionLoading === `user-delete-${u.id}`}
                                >
                                  <Trash2 className="h-4 w-4 inline" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: STORAGE */}
          {activeTab === 'storage' && stats && (
            <div className="space-y-6">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Disk Space Distribution</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Visual Storage Cards */}
                <div className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border">
                    <div className="text-xs text-slate-400 font-semibold mb-1">TOTAL STORAGE IN USE</div>
                    <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-200">
                      {formatBytes(stats.storageUsage.totalBytes)}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { label: 'File Attachments (uploads/)', bytes: stats.storageUsage.uploadsBytes, color: 'bg-indigo-500' },
                      { label: 'User Avatars (avatars/)', bytes: stats.storageUsage.avatarsBytes, color: 'bg-teal-500' },
                      { label: 'System Backups (backups/)', bytes: stats.storageUsage.backupsBytes, color: 'bg-amber-500' },
                      { label: 'Database Logs (logs/)', bytes: stats.storageUsage.logsBytes, color: 'bg-rose-500' },
                      { label: 'JSON DB Stores (users/chats/msgs)', bytes: stats.storageUsage.databaseBytes, color: 'bg-blue-500' },
                    ].map((item, idx) => {
                      const percentage = stats.storageUsage.totalBytes > 0 
                        ? (item.bytes / stats.storageUsage.totalBytes) * 100 
                        : 0;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-slate-600 dark:text-slate-400">{item.label}</span>
                            <span className="text-slate-800 dark:text-slate-200 font-semibold">
                              {formatBytes(item.bytes)} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-2">
                            <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* System Specs */}
                <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-xl border space-y-4">
                  <h5 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Server Environments</h5>
                  
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-400">Node.js Version</span>
                      <span className="font-semibold">{stats.system.nodeVersion}</span>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-400">Host OS Platform</span>
                      <span className="font-semibold capitalize">{stats.system.platform}</span>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-400">Server Uptime</span>
                      <span className="font-semibold">{Math.floor(stats.system.uptime / 60)} minutes</span>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-400">Active User Sessions</span>
                      <span className="font-semibold">{stats.totalSessions} active</span>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-400">Conversations Count</span>
                      <span className="font-semibold">{stats.totalChats} chats</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB: BACKUPS */}
          {activeTab === 'backups' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Backup & Restoration</h4>
                <button
                  onClick={handleCreateBackup}
                  disabled={loading}
                  className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="animate-spin h-3.5 w-3.5" />}
                  Create Backup Point
                </button>
              </div>

              {backups.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-xl text-slate-400 text-sm">
                  No backups found. Click "Create Backup Point" to create a new database snapshot.
                </div>
              ) : (
                <div className="space-y-2">
                  {backups.map((b) => (
                    <div key={b.filename} className="p-3 bg-slate-50 dark:bg-slate-900/40 border rounded-xl flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{b.filename}</p>
                        <p className="text-xxs text-slate-400">
                          Size: {formatBytes(b.sizeBytes)} | Created: {new Date(b.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRestoreBackup(b.filename)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                          title="Restore this backup"
                          disabled={actionLoading === `backup-restore-${b.filename}`}
                        >
                          {actionLoading === `backup-restore-${b.filename}` ? (
                            <Loader2 className="animate-spin h-4 w-4" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(b.filename)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                          title="Delete backup file"
                          disabled={actionLoading === `backup-delete-${b.filename}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4 flex flex-col h-full min-h-[50vh]">
              {/* Log Query filters */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="relative sm:col-span-2">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search messages/details..."
                    value={logQuery}
                    onChange={(e) => {
                      setLogQuery(e.target.value);
                      setLogPage(0);
                    }}
                    className="block w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                    style={{ paddingLeft: '2.35rem' }}
                  />
                </div>
                <select
                  value={logLevel}
                  onChange={(e) => {
                    setLogLevel(e.target.value);
                    setLogPage(0);
                  }}
                  className="block w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                >
                  <option value="">All Levels</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>
                <select
                  value={logCategory}
                  onChange={(e) => {
                    setLogCategory(e.target.value);
                    setLogPage(0);
                  }}
                  className="block w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                >
                  <option value="">All Categories</option>
                  <option value="SYSTEM">SYSTEM</option>
                  <option value="AUTH">AUTH</option>
                  <option value="CHAT">CHAT</option>
                  <option value="FILE">FILE</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              {/* Log output stream */}
              <div className="flex-1 bg-slate-950 border border-slate-900 rounded-xl p-4 font-mono text-[10px] text-slate-300 overflow-y-auto max-h-[35vh]">
                {logs.length === 0 ? (
                  <div className="text-slate-500 text-center py-10">No matching logs found.</div>
                ) : (
                  logs.map((log, idx) => {
                    let levelColor = 'text-green-400';
                    if (log.level === 'WARN') levelColor = 'text-amber-400';
                    else if (log.level === 'ERROR') levelColor = 'text-red-400';

                    return (
                      <div key={idx} className="py-1 hover:bg-white/5 border-b border-white/5 transition-all">
                        <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                        <span className={`font-bold ${levelColor}`}>[{log.level}]</span>{' '}
                        <span className="text-indigo-400">[{log.category}]</span>{' '}
                        <span className="text-slate-100">{log.message}</span>{' '}
                        {log.details && (
                          <span className="text-slate-500">{JSON.stringify(log.details)}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-slate-500 py-2">
                <span>Total records: {totalLogs}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLogPage(Math.max(0, logPage - 1))}
                    disabled={logPage === 0}
                    className="py-1 px-2 border rounded hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <span className="py-1 px-2">Page {logPage + 1} of {Math.ceil(totalLogs / 30) || 1}</span>
                  <button
                    onClick={() => setLogPage(logPage + 1)}
                    disabled={(logPage + 1) * 30 >= totalLogs}
                    className="py-1 px-2 border rounded hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
