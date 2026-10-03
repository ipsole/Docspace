'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useConfirm } from '@/context/ConfirmContext';
import { TabAccessLevel } from '@/lib/storage/models';
import {
  Settings, User, Bell, Shield, Users, Trash2,
  Save, Loader2, Check, Eye, EyeOff, LogOut, AlertCircle, Camera, Database,
  Plus, Edit2, X, CheckCircle2, ShieldCheck, UserPlus, Search, Lock, SlidersHorizontal, Mail,
  AlertTriangle, ShieldAlert, Cloud, RefreshCw, ExternalLink, Folder, FolderPlus, FileText, HardDrive, Receipt
} from 'lucide-react';
import StorageRecordsSection from '@/components/StorageRecordsSection';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

type SettingsTab = 'profile' | 'workspace' | 'data-records' | 'notifications' | 'security' | 'storage';

interface WorkspaceMemberRow {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatar?: string | null;
  role: string;
  tabPermissions?: Record<string, TabAccessLevel>;
  joinedAt?: string;
}

interface SystemUserProfile {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatar?: string | null;
}

const MODULE_TABS: { id: string; label: string; group: 'Collaboration' | 'CRM' | 'System'; description: string }[] = [
  { id: 'chats', label: 'Chats', group: 'Collaboration', description: 'Direct, channel, and client messaging' },
  { id: 'projects', label: 'Projects', group: 'Collaboration', description: 'Projects, kanban boards, and task tracking' },
  { id: 'calendar', label: 'Calendar', group: 'Collaboration', description: 'Workspace schedules, meetings, and deadlines' },
  { id: 'leads', label: 'Leads', group: 'CRM', description: 'Inbound lead pipelines and conversions' },
  { id: 'clients', label: 'Clients', group: 'CRM', description: 'Client CRM records, tags, and profiles' },
  { id: 'invoices', label: 'Invoices', group: 'CRM', description: 'Billing documents, invoices, and payouts' },
  { id: 'white-label', label: 'White Label', group: 'CRM', description: 'Custom branding and client portals' },
  { id: 'billing', label: 'Billing', group: 'System', description: 'Workspace subscriptions and billing limits' },
  { id: 'storage', label: 'Storage', group: 'System', description: 'Storage quota, usage, and assets' },
  { id: 'settings', label: 'Settings', group: 'System', description: 'Team management and workspace administration' },
];

function getRoleDefaultPermissions(role: string): Record<string, TabAccessLevel> {
  const perms: Record<string, TabAccessLevel> = {};
  if (role === 'manager' || role === 'owner' || role === 'admin') {
    MODULE_TABS.forEach(tab => { perms[tab.id] = 'full'; });
  } else if (role === 'team' || role === 'member') {
    MODULE_TABS.forEach(tab => {
      perms[tab.id] = tab.group === 'System' ? 'none' : 'full';
    });
  } else if (role === 'client') {
    MODULE_TABS.forEach(tab => { perms[tab.id] = 'none'; });
    perms['chats'] = 'full';
    perms['invoices'] = 'view';
  } else {
    MODULE_TABS.forEach(tab => { perms[tab.id] = 'full'; });
  }
  return perms;
}

const ROLE_OPTIONS = [
  {
    role: 'manager' as const,
    title: 'Manager',
    desc: 'Full workspace module access for daily operations. Access management and adding members is reserved for Admin.',
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  },
  {
    role: 'team' as const,
    title: 'Team Member',
    desc: 'Full access to Collaboration & CRM modules. Restricted from System & Workspace settings.',
    badgeClass: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800'
  }
];

const getRoleBadgeClass = (role: string) => {
  switch (role) {
    case 'owner':
      return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    case 'manager':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    case 'team':
    case 'member':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800';
    case 'client':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
};

export default function SettingsPage() {
  const { user, logout, updateUserContext } = useAuth();
  const { activeWorkspace, setActiveWorkspace, fetchWorkspaces, getTabAccess, refreshCurrentMember } = useWorkspace();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '');

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Workspace state
  const [wsName, setWsName] = useState(activeWorkspace?.name ?? '');
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([]);
  const [allUsers, setAllUsers] = useState<SystemUserProfile[]>([]);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  // Add Member modal state
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberMode, setAddMemberMode] = useState<'google' | 'existing'>('google');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<'manager' | 'team'>('team');
  const [tabPermissions, setTabPermissions] = useState<Record<string, TabAccessLevel>>(getRoleDefaultPermissions('team'));
  const [submittingMember, setSubmittingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Edit Member modal state
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMemberRow | null>(null);
  const [editingRole, setEditingRole] = useState<'manager' | 'team'>('team');
  const [editingTabPermissions, setEditingTabPermissions] = useState<Record<string, TabAccessLevel>>({});
  const [updatingMember, setUpdatingMember] = useState(false);
  const [editMemberError, setEditMemberError] = useState<string | null>(null);

  // Google Drive storage state
  const [gdriveConfig, setGdriveConfig] = useState<{
    connected: boolean;
    status: string;
    connectedAt?: string;
    connectedByEmail?: string;
    folders?: Record<string, string>;
    rootFolderId?: string;
    invoiceFolderId?: string;
    invoiceFolderName?: string;
    quota?: {
      usageBytes: number;
      limitBytes: number | null;
      usageInDriveBytes: number;
      usageInTrashBytes: number;
      user?: { displayName?: string; emailAddress?: string; photoLink?: string };
    };
  } | null>(null);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [gdriveMsg, setGdriveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [gdriveFoldersList, setGdriveFoldersList] = useState<any[]>([]);
  const [loadingDriveFolders, setLoadingDriveFolders] = useState(false);
  const [showCreateDriveFolderModal, setShowCreateDriveFolderModal] = useState(false);
  const [newDriveFolderName, setNewDriveFolderName] = useState('');
  const [creatingDriveFolder, setCreatingDriveFolder] = useState(false);
  const [gdriveFilesList, setGdriveFilesList] = useState<any[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [deletingDriveItem, setDeletingDriveItem] = useState<string | null>(null);
  const [savingInvoiceFolder, setSavingInvoiceFolder] = useState(false);
  const [selectedInvoiceFolderId, setSelectedInvoiceFolderId] = useState<string>('');

  useEffect(() => {
    setUsername(user?.username ?? '');
    setDisplayName(user?.displayName ?? '');
    setEmail(user?.email ?? '');
    setBio(user?.bio ?? '');
    setAvatar(user?.avatar ?? '');
  }, [user]);

  useEffect(() => {
    setWsName(activeWorkspace?.name ?? '');
    fetchMembers();
  }, [activeWorkspace]);

  const fetchDriveFolders = async () => {
    setLoadingDriveFolders(true);
    try {
      const res = await fetch('/api/storage/google/folders');
      if (res.ok) {
        const data = await res.json();
        setGdriveFoldersList(data.folders || []);
      }
    } catch {}
    finally {
      setLoadingDriveFolders(false);
    }
  };

  const fetchDriveFiles = async () => {
    setLoadingDriveFiles(true);
    try {
      const res = await fetch('/api/storage/google/files');
      if (res.ok) {
        const data = await res.json();
        setGdriveFilesList(data.files || []);
      }
    } catch {}
    finally {
      setLoadingDriveFiles(false);
    }
  };

  // Fetch GDrive status and folders when storage tab becomes active
  useEffect(() => {
    if (activeTab !== 'storage') return;
    setGdriveLoading(true);
    fetch('/api/storage/google/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setGdriveConfig(data);
        if (data?.connected) {
          fetchDriveFolders();
          fetchDriveFiles();
        }
      })
      .catch(() => {})
      .finally(() => setGdriveLoading(false));
  }, [activeTab]);

  const handleCreateDriveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriveFolderName.trim()) return;
    setCreatingDriveFolder(true);
    setGdriveMsg(null);
    try {
      const res = await fetch('/api/storage/google/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDriveFolderName.trim() }),
      });
      if (res.ok) {
        setNewDriveFolderName('');
        setShowCreateDriveFolderModal(false);
        setGdriveMsg({ type: 'success', text: `Folder "${newDriveFolderName.trim()}" created in Google Drive!` });
        await fetchDriveFolders();
      } else {
        const err = await res.json().catch(() => ({}));
        setGdriveMsg({ type: 'error', text: err.error || 'Failed to create folder' });
      }
    } catch (err: any) {
      setGdriveMsg({ type: 'error', text: err.message || 'Failed to create folder' });
    } finally {
      setCreatingDriveFolder(false);
    }
  };

  const handleDeleteDriveFolder = async (folderId: string, folderName: string) => {
    if (!window.confirm(`Are you sure you want to delete the folder "${folderName}" and its contents from Google Drive? This cannot be undone.`)) return;
    setDeletingDriveItem(folderId);
    setGdriveMsg(null);
    try {
      const res = await fetch(`/api/storage/google/folders?folderId=${encodeURIComponent(folderId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGdriveMsg({ type: 'success', text: `Folder "${folderName}" deleted from Google Drive.` });
        await fetchDriveFolders();
      } else {
        const err = await res.json().catch(() => ({}));
        setGdriveMsg({ type: 'error', text: err.error || 'Failed to delete folder' });
      }
    } catch (err: any) {
      setGdriveMsg({ type: 'error', text: err.message || 'Failed to delete folder' });
    } finally {
      setDeletingDriveItem(null);
    }
  };

  const handleDeleteDriveFile = async (fileRecordId: string, driveFileId: string, fileName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${fileName}" from Google Drive?`)) return;
    setDeletingDriveItem(fileRecordId || driveFileId);
    setGdriveMsg(null);
    try {
      const res = await fetch(`/api/storage/google/files?id=${encodeURIComponent(fileRecordId)}&driveFileId=${encodeURIComponent(driveFileId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGdriveMsg({ type: 'success', text: `File "${fileName}" deleted from Google Drive.` });
        await fetchDriveFiles();
      } else {
        const err = await res.json().catch(() => ({}));
        setGdriveMsg({ type: 'error', text: err.error || 'Failed to delete file' });
      }
    } catch (err: any) {
      setGdriveMsg({ type: 'error', text: err.message || 'Failed to delete file' });
    } finally {
      setDeletingDriveItem(null);
    }
  };

  useEffect(() => {
    if (gdriveConfig?.invoiceFolderId) {
      setSelectedInvoiceFolderId(gdriveConfig.invoiceFolderId);
    } else if (gdriveConfig?.folders?.invoices) {
      setSelectedInvoiceFolderId(gdriveConfig.folders.invoices);
    }
  }, [gdriveConfig]);

  const handleUpdateInvoiceFolder = async (folderId: string) => {
    setSelectedInvoiceFolderId(folderId);
    setSavingInvoiceFolder(true);
    setGdriveMsg(null);
    try {
      const folderObj = gdriveFoldersList.find((f: any) => f.id === folderId);
      const folderName = folderObj?.name || 'Invoices';
      const res = await fetch('/api/storage/google/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceFolderId: folderId,
          invoiceFolderName: folderName,
        }),
      });
      if (res.ok) {
        setGdriveConfig(prev => prev ? ({
          ...prev,
          invoiceFolderId: folderId,
          invoiceFolderName: folderName,
        }) : prev);
        setGdriveMsg({ type: 'success', text: `Invoice PDF destination folder updated to "${folderName}".` });
      } else {
        const err = await res.json().catch(() => ({}));
        setGdriveMsg({ type: 'error', text: err.error || 'Failed to update destination folder' });
      }
    } catch (err: any) {
      setGdriveMsg({ type: 'error', text: err.message || 'Failed to update destination folder' });
    } finally {
      setSavingInvoiceFolder(false);
    }
  };

  // Read OAuth result from URL query params after redirect back from Google
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab    = params.get('tab');
    const status = params.get('status');
    const reason = params.get('reason');
    if (tab === 'storage') {
      setActiveTab('storage');
      if (status === 'connected') {
        setGdriveMsg({ type: 'success', text: 'Google Drive connected successfully!' });
      } else if (status === 'error') {
        setGdriveMsg({ type: 'error', text: `Connection failed: ${reason ?? 'unknown error'}` });
      }
      // Clean query string without reload
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  const handleConnectGoogleDrive = async () => {
    setGdriveConnecting(true);
    setGdriveMsg(null);
    try {
      const res = await fetch('/api/storage/google/connect');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to get authorization URL');
      }
      const { authUrl } = await res.json();
      // Navigate browser to Google consent screen
      window.location.href = authUrl;
    } catch (err: any) {
      setGdriveMsg({ type: 'error', text: err.message ?? 'Could not initiate Drive connection' });
      setGdriveConnecting(false);
    }
  };

  const fetchMembers = async () => {
    if (!activeWorkspace) return;
    try {
      const [membersRes, usersRes] = await Promise.all([
        fetch(`/api/workspaces/members?workspaceId=${activeWorkspace.id}`),
        fetch('/api/users'),
      ]);
      if (!membersRes.ok) return;

      const [membershipRows, users] = await Promise.all([
        membersRes.json(),
        usersRes.ok ? usersRes.json() : [],
      ]);
      setAllUsers(users || []);
      const usersById = new Map<string, SystemUserProfile>((users || []).map((profile: SystemUserProfile) => [profile.id, profile]));

      setMembers(membershipRows.map((member: {
        userId: string;
        role: string;
        tabPermissions?: Record<string, TabAccessLevel>;
        joinedAt?: string;
      }) => {
        const profile = usersById.get(member.userId);
        return {
          id: member.userId,
          username: profile?.username || member.userId,
          displayName: profile?.displayName,
          email: profile?.email,
          avatar: profile?.avatar || null,
          role: member.role,
          tabPermissions: member.tabPermissions || getRoleDefaultPermissions(member.role),
          joinedAt: member.joinedAt,
        };
      }));
    } catch { /* ignore */ }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username.trim().toLowerCase(),
          displayName: displayName.trim(), 
          email: email.trim(), 
          bio: bio.trim(), 
          avatar: avatar || null 
        }),
      });
      if (res.ok) {
        updateUserContext(await res.json());
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to save profile');
      }
    } catch { 
      alert('Network error while saving profile');
    }
    finally { setSaving(false); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 5 * 1024 * 1024) {
      alert('Profile photo must be under 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'avatar');

    setAvatarLoading(true);
    try {
      const uploadRes = await fetch('/api/files', { method: 'POST', body: formData });
      const fileData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(fileData.error || 'Upload failed');

      const userRes = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: fileData.url }),
      });
      const updatedUser = await userRes.json();
      if (!userRes.ok) throw new Error(updatedUser.error || 'Failed to save profile photo');

      setAvatar(updatedUser.avatar ?? fileData.url);
      updateUserContext(updatedUser);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to upload profile photo');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { alert('Passwords do not match'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: currentPassword, newPassword }),
      });
      if (res.ok) {
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        const data = await res.json();
        alert(data.error ?? 'Failed to change password');
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const isWorkspaceOwner = activeWorkspace?.ownerId === user?.id;
  const currentMemberRecord = members.find(m => m.id === user?.id);
  const currentMemberRole = currentMemberRecord?.role;
  // Strictly only the Workspace Owner / Admin has permission to add team members, edit access, or remove accounts
  const canManageWorkspace = isWorkspaceOwner || currentMemberRole === 'owner';
  const hasSettingsAccess = isWorkspaceOwner || currentMemberRole === 'owner' || getTabAccess('settings') !== 'none';

  useEffect(() => {
    if (!hasSettingsAccess && (activeTab === 'workspace' || activeTab === 'data-records')) {
      setActiveTab('profile');
    }
  }, [hasSettingsAccess, activeTab]);

  const openAddModal = () => {
    const unjoined = allUsers.filter(u => !members.some(m => m.id === u.id));
    if (unjoined.length > 0) {
      setSelectedUserId(unjoined[0].id);
    } else {
      setSelectedUserId('');
    }
    setAddMemberMode('google');
    setNewMemberEmail('');
    setNewMemberName('');
    setUserSearch('');
    setSelectedRole('team');
    setTabPermissions(getRoleDefaultPermissions('team'));
    setAddMemberError(null);
    setShowAddMemberModal(true);
  };

  const openEditModal = (member: WorkspaceMemberRow) => {
    setEditingMember(member);
    const validRole = (['manager', 'team'].includes(member.role) ? member.role : 'team') as 'manager' | 'team';
    setEditingRole(validRole);
    setEditingTabPermissions({ ...(member.tabPermissions || getRoleDefaultPermissions(validRole)) });
    setEditMemberError(null);
    setShowEditMemberModal(true);
  };

  const handleSelectRole = (role: 'manager' | 'team') => {
    setSelectedRole(role);
    setTabPermissions(getRoleDefaultPermissions(role));
  };

  const handleSelectEditingRole = (role: 'manager' | 'team') => {
    setEditingRole(role);
    setEditingTabPermissions(getRoleDefaultPermissions(role));
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;

    if (addMemberMode === 'google') {
      if (!newMemberEmail.trim()) {
        setAddMemberError('Please enter a Google / Gmail email address');
        return;
      }
      if (!newMemberEmail.includes('@')) {
        setAddMemberError('Please enter a valid email address');
        return;
      }
    } else {
      if (!selectedUserId) {
        setAddMemberError('Please select an account');
        return;
      }
    }

    setSubmittingMember(true);
    setAddMemberError(null);
    try {
      const payload: any = {
        workspaceId: activeWorkspace.id,
        role: selectedRole,
        tabPermissions,
      };

      if (addMemberMode === 'google') {
        payload.email = newMemberEmail.trim().toLowerCase();
        payload.name = newMemberName.trim();
      } else {
        payload.userId = selectedUserId;
      }

      const res = await fetch('/api/workspaces/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add member');
      }
      setShowAddMemberModal(false);
      setSelectedUserId('');
      setNewMemberEmail('');
      setNewMemberName('');
      setUserSearch('');
      await fetchMembers();
      await refreshCurrentMember();
    } catch (err: any) {
      setAddMemberError(err.message || 'Failed to add member');
    } finally {
      setSubmittingMember(false);
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !editingMember) return;
    setUpdatingMember(true);
    setEditMemberError(null);
    try {
      const res = await fetch('/api/workspaces/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          userId: editingMember.id,
          role: editingRole,
          tabPermissions: editingTabPermissions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update member');
      }
      setShowEditMemberModal(false);
      setEditingMember(null);
      await fetchMembers();
      await refreshCurrentMember();
    } catch (err: any) {
      setEditMemberError(err.message || 'Failed to update member');
    } finally {
      setUpdatingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!activeWorkspace) return;
    const ok = await confirm({
      title: 'Remove Workspace Member',
      message: 'Are you sure you want to remove this member from the workspace? They will lose access immediately.',
      confirmText: 'Remove Member',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await fetch(`/api/workspaces/members?workspaceId=${activeWorkspace.id}&userId=${memberId}`, { method: 'DELETE' });
      await fetchMembers();
      await refreshCurrentMember();
    } catch { /* ignore */ }
  };

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace || (activeWorkspace.ownerId !== user?.id && user?.role !== 'admin')) return;
    if (!deleteConfirmChecked || deleteConfirmName !== activeWorkspace.name) return;

    const ok = await confirm({
      title: `Permanently Delete "${activeWorkspace.name}"?`,
      message: `Are you completely certain? All records, channel configurations, and member assignments for "${activeWorkspace.name}" will be permanently erased. This cannot be undone.`,
      confirmText: 'Delete Permanently',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingWorkspace(true);
    try {
      const res = await fetch(`/api/workspaces?workspaceId=${activeWorkspace.id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveWorkspace(null);
        setDeleteConfirmName('');
        setDeleteConfirmChecked(false);
        await fetchWorkspaces();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete workspace');
      }
    } catch {
      alert('Failed to delete workspace');
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const renderPermissionsSection = (
    currentPerms: Record<string, TabAccessLevel>,
    onUpdateTab: (tabId: string, level: TabAccessLevel) => void,
    onSetAll: (level: TabAccessLevel) => void,
    onReset: () => void
  ) => {
    const groups: ('Collaboration' | 'CRM' | 'System')[] = ['Collaboration', 'CRM', 'System'];
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Tab & Module Permissions</h4>
            <p className="text-[10px] text-slate-400">Configure read & write (Full), read-only (View), or hidden (No Access).</p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onSetAll('full')}
              className="px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
            >
              All Full
            </button>
            <button
              type="button"
              onClick={() => onSetAll('view')}
              className="px-2 py-1 text-[10px] font-semibold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors cursor-pointer"
            >
              All View
            </button>
            <button
              type="button"
              onClick={onReset}
              className="px-2 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Reset Role Preset
            </button>
          </div>
        </div>

        <div className="space-y-4 max-h-[38vh] overflow-y-auto pr-1">
          {groups.map(group => {
            const tabsInGroup = MODULE_TABS.filter(t => t.group === group);
            return (
              <div key={group} className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{group}</p>
                <div className="space-y-1.5">
                  {tabsInGroup.map(tab => {
                    const currentLevel: TabAccessLevel = currentPerms[tab.id] ?? 'none';
                    return (
                      <div
                        key={tab.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800/60 gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{tab.label}</p>
                          <p className="text-[10px] text-slate-400 truncate">{tab.description}</p>
                        </div>
                        <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 dark:bg-slate-800/80 shrink-0 self-start sm:self-center">
                          <button
                            type="button"
                            onClick={() => onUpdateTab(tab.id, 'full')}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              currentLevel === 'full'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            Full
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateTab(tab.id, 'view')}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              currentLevel === 'view'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateTab(tab.id, 'none')}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              currentLevel === 'none'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            None
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const allTabs: { id: SettingsTab; label: string; icon: React.ReactNode; requiresSettingsAccess?: boolean }[] = [
    { id: 'profile',       label: 'Profile',                icon: <User className="h-4 w-4" /> },
    { id: 'workspace',     label: 'Workspace',              icon: <Users className="h-4 w-4" />, requiresSettingsAccess: true },
    { id: 'data-records',  label: 'Data & Storage Records', icon: <Database className="h-4 w-4" />, requiresSettingsAccess: true },
    { id: 'storage',       label: 'Cloud Storage',          icon: <Cloud className="h-4 w-4" />, requiresSettingsAccess: true },
    { id: 'notifications', label: 'Notifications',          icon: <Bell className="h-4 w-4" /> },
    { id: 'security',      label: 'Security',               icon: <Shield className="h-4 w-4" /> },
  ];

  const TABS = allTabs.filter(tab => !tab.requiresSettingsAccess || hasSettingsAccess);

  const unjoinedUsers = allUsers.filter(u => !members.some(m => m.id === u.id));
  const filteredUsers = unjoinedUsers.filter(u => {
    const q = userSearch.toLowerCase();
    return (u.username?.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  });

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-indigo-500" />
          Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage your account preferences and workspace configuration.</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 p-1.5 neu-inset rounded-2xl overflow-x-auto no-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs rounded-xl font-bold transition-all whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'neu-btn text-[#466380]'
                : 'text-[#718096] hover:text-[#2d3748]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="neu-raised rounded-[2.2rem] p-7 space-y-6">
          <h2 className="text-sm font-black text-[#2d3748] tracking-tight">Profile Information</h2>
          <form onSubmit={handleSaveProfile} className="space-y-5">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="h-16 w-16 rounded-2xl neu-raised flex items-center justify-center text-[#466380] font-black text-2xl overflow-hidden transition-all"
                  title="Change profile photo"
                >
                  {avatar ? (
                    <img src={avatar} alt={user?.username ?? 'Profile photo'} className="h-full w-full object-cover" />
                  ) : (
                    (user?.displayName ?? user?.username ?? 'U')[0].toUpperCase()
                  )}
                  <span className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    {avatarLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  </span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={avatarLoading}
                />
              </div>
              <div>
                <p className="text-sm font-black text-[#2d3748]">{user?.displayName ?? user?.username}</p>
                <p className="text-xs text-[#718096] font-semibold mt-0.5">@{user?.username}</p>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="mt-2 text-xs font-bold text-[#466380] hover:underline disabled:opacity-60"
                >
                  {avatarLoading ? 'Uploading...' : 'Upload profile photo'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#62748a] mb-1.5">Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                    placeholder="e.g. john_doe"
                    className="w-full pl-8 pr-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748]"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Unique handle used to start direct chats and mention you.</p>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#62748a] mb-1.5">Display Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748]" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#62748a] mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748]" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#62748a] mb-1.5">Bio</label>
                <textarea rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell your team a bit about yourself..."
                  className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748] resize-none" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={saving}
                className="neu-steel-fill flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Workspace Tab */}
      {activeTab === 'workspace' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  Workspace Team & Members
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Add team accounts, assign roles, and customize tab-level access permissions.
                </p>
              </div>

              {canManageWorkspace && (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Team Member
                </button>
              )}
            </div>

            {!activeWorkspace ? (
              <div className="text-center py-8 text-slate-400">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No workspace selected</p>
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No members found</p>
            ) : (
              <div className="space-y-3">
                {members.map(m => (
                  <div key={m.id} className="p-4 bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl space-y-3 transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0 shadow-2xs">
                          {m.avatar ? (
                            <img src={m.avatar} alt={m.displayName ?? m.username} className="h-full w-full object-cover" />
                          ) : (
                            (m.displayName ?? m.username)[0].toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{m.displayName ?? m.username}</p>
                            {m.id === user?.id && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded shrink-0">You</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">@{m.username} {m.email ? `• ${m.email}` : ''}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl uppercase tracking-wider border ${getRoleBadgeClass(m.role)}`}>
                          {m.role}
                        </span>

                        {canManageWorkspace && m.role !== 'owner' && (
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-2xs cursor-pointer"
                            title="Edit role and permissions"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Edit Access</span>
                          </button>
                        )}

                        {canManageWorkspace && m.id !== user?.id && m.role !== 'owner' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.id)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Permissions summary pills */}
                    {m.role !== 'owner' && (
                      <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-slate-400 mr-1">Access:</span>
                        {MODULE_TABS.map(tab => {
                          const access = m.tabPermissions?.[tab.id] ?? (m.role === 'manager' ? 'full' : 'none');
                          if (access === 'none') return null;
                          return (
                            <span
                              key={tab.id}
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                                access === 'full'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/50'
                                  : 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/50'
                              }`}
                              title={`${tab.label}: ${access === 'full' ? 'Full Access' : 'View Only'}`}
                            >
                              {tab.label}
                              {access === 'view' && <span className="text-[8px] opacity-75 font-normal">(view)</span>}
                            </span>
                          );
                        })}
                        {MODULE_TABS.every(tab => (m.tabPermissions?.[tab.id] ?? 'none') === 'none') && (
                          <span className="text-[9px] text-slate-400 italic">No tab access granted</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
          onClick={e => { if (e.target === e.currentTarget) setShowAddMemberModal(false); }}
        >
          <div className="w-full max-w-xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 overflow-y-auto space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-indigo-500" />
                  Add Team Member
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select an account and configure their role and tab permissions in {activeWorkspace?.name}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addMemberError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{addMemberError}</span>
              </div>
            )}

            {/* Target Workspace Banner */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  {activeWorkspace?.name ? activeWorkspace.name.slice(0, 2).toUpperCase() : 'WS'}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Workspace</p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{activeWorkspace?.name || 'Default Workspace'}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Workspace Access Granted
              </span>
            </div>

            <form onSubmit={handleAddMember} className="space-y-5">
              {/* Mode Toggle: Google Account Invite vs Existing Account */}
              <div className="space-y-2">
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMemberMode('google');
                      setAddMemberError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      addMemberMode === 'google'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                    </svg>
                    <span>Authorize Google / Gmail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMemberMode('existing');
                      setAddMemberError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      addMemberMode === 'existing'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Existing Account ({unjoinedUsers.length})</span>
                  </button>
                </div>
              </div>

              {/* Mode 1: Authorize Google / Gmail Account */}
              {addMemberMode === 'google' && (
                <div className="space-y-3.5 p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      Google / Gmail Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={newMemberEmail}
                        onChange={e => setNewMemberEmail(e.target.value)}
                        placeholder="e.g. colleague@gmail.com"
                        className="w-full pl-10 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Only this email will be authorized to authenticate and access this workspace via Google login.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      Member Name <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <div className="relative">
                      <User className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={newMemberName}
                        onChange={e => setNewMemberName(e.target.value)}
                        placeholder="e.g. Rohit Sharma or Sarah"
                        className="w-full pl-10 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 2: Existing Account Selector */}
              {addMemberMode === 'existing' && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Select Account
                  </label>
                  {unjoinedUsers.length === 0 ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl text-center text-xs text-slate-500">
                      All registered accounts are already members of this workspace. Switch to "Authorize Google / Gmail" above to invite a new person.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {unjoinedUsers.length > 5 && (
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search accounts..."
                            value={userSearch}
                            onChange={e => setUserSearch(e.target.value)}
                            className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      )}
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {filteredUsers.map(u => (
                          <div
                            key={u.id}
                            onClick={() => setSelectedUserId(u.id)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                              selectedUserId === u.id
                                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                                : 'bg-slate-50/70 dark:bg-slate-950 border-slate-200/70 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                {u.avatar ? (
                                  <img src={u.avatar} alt={u.displayName ?? u.username} className="h-full w-full object-cover rounded-lg" />
                                ) : (
                                  (u.displayName ?? u.username)[0].toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{u.displayName ?? u.username}</p>
                                <p className="text-[10px] text-slate-400 truncate">@{u.username} {u.email ? `• ${u.email}` : ''}</p>
                              </div>
                            </div>
                            {selectedUserId === u.id && (
                              <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Role Preset Selector */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Assign Role Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ROLE_OPTIONS.map(opt => (
                    <div
                      key={opt.role}
                      onClick={() => handleSelectRole(opt.role)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        selectedRole === opt.role
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-2xs'
                          : 'bg-slate-50/60 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{opt.title}</span>
                        {selectedRole === opt.role && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">{opt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tab Permissions Section */}
              {renderPermissionsSection(
                tabPermissions,
                (tabId, level) => setTabPermissions(prev => ({ ...prev, [tabId]: level })),
                (level) => {
                  const updated: Record<string, TabAccessLevel> = {};
                  MODULE_TABS.forEach(t => { updated[t.id] = level; });
                  setTabPermissions(updated);
                },
                () => setTabPermissions(getRoleDefaultPermissions(selectedRole))
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMember || (addMemberMode === 'google' ? !newMemberEmail.trim() : !selectedUserId)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingMember ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {addMemberMode === 'google' ? 'Authorize Google Account' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditMemberModal && editingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden"
          onClick={e => { if (e.target === e.currentTarget) setShowEditMemberModal(false); }}
        >
          <div className="w-full max-w-xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 overflow-y-auto space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit2 className="h-4 w-4 text-indigo-500" />
                  Edit Member Permissions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Update role and tab access for {editingMember.displayName ?? editingMember.username}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditMemberModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Member Profile Banner */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
                {editingMember.avatar ? (
                  <img src={editingMember.avatar} alt={editingMember.displayName ?? editingMember.username} className="h-full w-full object-cover" />
                ) : (
                  (editingMember.displayName ?? editingMember.username)[0].toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{editingMember.displayName ?? editingMember.username}</p>
                <p className="text-[10px] text-slate-400 truncate">@{editingMember.username} {editingMember.email ? `• ${editingMember.email}` : ''}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider border ${getRoleBadgeClass(editingRole)}`}>
                {editingRole}
              </span>
            </div>

            {editMemberError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editMemberError}</span>
              </div>
            )}

            {/* Target Workspace Banner */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  {activeWorkspace?.name ? activeWorkspace.name.slice(0, 2).toUpperCase() : 'WS'}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Workspace</p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{activeWorkspace?.name || 'Default Workspace'}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Active Member
              </span>
            </div>

            <form onSubmit={handleUpdateMember} className="space-y-5">
              {/* Role Preset Selector */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Role Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ROLE_OPTIONS.map(opt => (
                    <div
                      key={opt.role}
                      onClick={() => handleSelectEditingRole(opt.role)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        editingRole === opt.role
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-2xs'
                          : 'bg-slate-50/60 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{opt.title}</span>
                        {editingRole === opt.role && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">{opt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tab Permissions Section */}
              {renderPermissionsSection(
                editingTabPermissions,
                (tabId, level) => setEditingTabPermissions(prev => ({ ...prev, [tabId]: level })),
                (level) => {
                  const updated: Record<string, TabAccessLevel> = {};
                  MODULE_TABS.forEach(t => { updated[t.id] = level; });
                  setEditingTabPermissions(updated);
                },
                () => setEditingTabPermissions(getRoleDefaultPermissions(editingRole))
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditMemberModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingMember}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {updatingMember ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save Permissions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Records & Storage Locations Tab */}
      {activeTab === 'data-records' && (
        <StorageRecordsSection />
      )}

      {/* Cloud Storage Tab — Google Drive central connection */}
      {activeTab === 'storage' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 shrink-0">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Google Drive Storage</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">One central Drive account shared across Docspace. All users can upload to it.</p>
              </div>
            </div>

            {/* Feedback message */}
            {gdriveMsg && (
              <div className={`flex items-start gap-2.5 p-3 rounded-xl mb-4 text-xs font-medium ${
                gdriveMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}>
                {gdriveMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                {gdriveMsg.text}
              </div>
            )}

            {/* Status card */}
            {gdriveLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking connection & quota…
              </div>
            ) : gdriveConfig?.connected ? (
              <div className="space-y-6">
                {/* Connection Banner */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-800 dark:text-emerald-200">Google Drive Connected</p>
                      <p className="text-[10px] text-emerald-600/90 dark:text-emerald-400/90 mt-0.5 truncate">
                        Account: <span className="font-semibold">{gdriveConfig.connectedByEmail || gdriveConfig.quota?.user?.emailAddress || 'Connected'}</span>
                        {gdriveConfig.quota?.user?.displayName && ` (${gdriveConfig.quota.user.displayName})`}
                        {gdriveConfig.connectedAt && ` · Connected ${new Date(gdriveConfig.connectedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={handleConnectGoogleDrive}
                      disabled={gdriveConnecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs shrink-0"
                    >
                      {gdriveConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Reconnect
                    </button>
                  )}
                </div>

                {/* Storage Quota Usage Display */}
                {gdriveConfig.quota && (
                  <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Google Drive Storage Usage</span>
                      </div>
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                        {formatBytes(gdriveConfig.quota.usageBytes)}
                        {gdriveConfig.quota.limitBytes ? ` / ${formatBytes(gdriveConfig.quota.limitBytes)}` : ' (Unlimited)'}
                        {gdriveConfig.quota.limitBytes ? ` (${Math.round((gdriveConfig.quota.usageBytes / gdriveConfig.quota.limitBytes) * 100)}%)` : ''}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    {gdriveConfig.quota.limitBytes ? (
                      <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            (gdriveConfig.quota.usageBytes / gdriveConfig.quota.limitBytes) > 0.9
                              ? 'bg-rose-500'
                              : (gdriveConfig.quota.usageBytes / gdriveConfig.quota.limitBytes) > 0.75
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(1, Math.round((gdriveConfig.quota.usageBytes / gdriveConfig.quota.limitBytes) * 100)))}%`
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-2 bg-emerald-500 rounded-full opacity-60" />
                    )}

                    <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400 font-medium">
                      <span>Drive files: {formatBytes(gdriveConfig.quota.usageInDriveBytes || gdriveConfig.quota.usageBytes)}</span>
                      {gdriveConfig.quota.usageInTrashBytes > 0 && (
                        <span>Trash: {formatBytes(gdriveConfig.quota.usageInTrashBytes)}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Invoice PDF Destination Folder Selector */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200/50 dark:border-emerald-800/40 shrink-0 mt-0.5">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          Invoice PDF Destination Folder
                          {savingInvoiceFolder && <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Select the Google Drive folder where generated invoice PDFs should be uploaded.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedInvoiceFolderId}
                        onChange={(e) => handleUpdateInvoiceFolder(e.target.value)}
                        disabled={savingInvoiceFolder || loadingDriveFolders}
                        aria-label="Invoice destination folder"
                        className="text-xs font-semibold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer min-w-[180px]"
                      >
                        <option value="">Default (Docspace / Invoices)</option>
                        {gdriveFoldersList.map((folder: any) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {gdriveConfig?.invoiceFolderName && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Current Target Folder:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Folder className="h-3 w-3" />
                        {gdriveConfig.invoiceFolderName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Folder Management Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Google Drive Folders</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Browse, open in Google Drive, or create custom folders</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateDriveFolderModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <FolderPlus className="h-3.5 w-3.5" /> + New Folder
                    </button>
                  </div>

                  {loadingDriveFolders ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading folders…
                    </div>
                  ) : gdriveFoldersList.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {gdriveFoldersList.map((folder: any) => {
                        const isCore = folder.name?.toLowerCase() === 'docspace' || folder.name?.toLowerCase() === 'docdril storage';
                        const isStd = folder.isStandard || isCore;

                        return (
                          <div
                            key={folder.id}
                            className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-2xl group hover:border-emerald-300 dark:hover:border-emerald-700 transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <Folder className={`h-4 w-4 shrink-0 ${isCore ? 'text-indigo-500' : isStd ? 'text-emerald-500' : 'text-amber-500'}`} />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate capitalize">{folder.name}</p>
                                <span className="text-[9px] text-slate-400 block truncate">
                                  {isCore ? 'Central Root' : isStd ? 'Standard Folder' : 'Custom Folder'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg transition-all"
                                title="Open folder in Google Drive"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              {!isStd && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDriveFolder(folder.id, folder.name)}
                                  disabled={deletingDriveItem === folder.id}
                                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                                  title="Delete folder from Drive"
                                >
                                  {deletingDriveItem === folder.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      No custom folders yet. Click "+ New Folder" to create one.
                    </div>
                  )}
                </div>

                {/* Uploaded Files Section */}
                {gdriveFilesList.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Files Uploaded to Google Drive</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Manage and delete individual files stored in Drive</p>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {gdriveFilesList.length} files
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {gdriveFilesList.map((file: any) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 rounded-xl text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-700 dark:text-slate-300 truncate text-[11px]">{file.name}</p>
                              <p className="text-[9px] text-slate-400">
                                {formatBytes(file.size)} · {file.uploadedByName || file.uploadedBy || 'Team'}
                                {file.createdAt && ` · ${new Date(file.createdAt).toLocaleDateString()}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {(file.googleDriveWebViewLink || file.url) && (
                              <a
                                href={file.googleDriveWebViewLink || file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded transition-all"
                                title="Open in Google Drive"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteDriveFile(file.id, file.googleDriveFileId, file.name)}
                              disabled={deletingDriveItem === file.id || deletingDriveItem === file.googleDriveFileId}
                              className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-all disabled:opacity-50 cursor-pointer"
                              title="Delete file from Google Drive"
                            >
                              {deletingDriveItem === file.id || deletingDriveItem === file.googleDriveFileId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  No Google Drive account is connected. Once connected, all Docspace users will be able to
                  upload files directly to a shared Drive folder as an alternative to Cloudflare R2.
                </div>

                {user?.role === 'admin' ? (
                  <div className="space-y-3">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Required environment variables</p>
                    <div className="font-mono text-[10px] bg-slate-950 text-green-400 rounded-xl p-3.5 space-y-1">
                      <p>GOOGLE_DRIVE_CLIENT_ID=…</p>
                      <p>GOOGLE_DRIVE_CLIENT_SECRET=…</p>
                      <p>GOOGLE_DRIVE_REDIRECT_URI=…/api/auth/google/callback</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectGoogleDrive}
                      disabled={gdriveConnecting}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
                    >
                      {gdriveConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                      {gdriveConnecting ? 'Redirecting to Google…' : 'Connect Google Drive'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Only system administrators can connect a Google Drive account.</p>
                )}
              </div>
            )}
          </div>

          {/* Create Drive Folder Modal */}
          {showCreateDriveFolderModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/60 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-4 text-xs animate-scale-in">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                    <FolderPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">New Drive Folder</h3>
                    <p className="text-slate-400 text-[10px] mt-0.5">Creates a folder inside the Docspace central Drive</p>
                  </div>
                </div>

                <form onSubmit={handleCreateDriveFolder} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Folder Name</label>
                    <input
                      type="text"
                      required
                      value={newDriveFolderName}
                      onChange={(e) => setNewDriveFolderName(e.target.value)}
                      placeholder="e.g. Marketing Videos, Client Brand Kits"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateDriveFolderModal(false)}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingDriveFolder || !newDriveFolderName.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      {creatingDriveFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Create Folder
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Info card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3">How it works</h3>
            <ul className="space-y-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> Admin connects ONE Google Drive account once via OAuth.</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> Files are organized in a <strong>Docdril Storage → Docspace</strong> folder hierarchy.</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> In the chat upload dialog, users can pick between <strong>Cloudflare R2</strong> (fast, private) and <strong>Google Drive</strong> (easy sharing, large files).</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> <strong>All teammates</strong> have the facility to upload and view Drive files without needing their own Google Drive account.</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> The refresh token is stored securely on the server — never exposed to the browser.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5">Notification Preferences</h2>
          <div className="space-y-4">
            {[
              { label: 'New messages', sub: 'Get notified when someone sends you a message' },
              { label: 'Project updates', sub: 'Receive updates when project tasks change' },
              { label: 'Mentions', sub: 'Get notified when someone mentions you' },
              { label: 'Workspace activity', sub: 'Daily digest of workspace events' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-checked:bg-indigo-600 rounded-full transition-all peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5">Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Current Password</label>
                <div className="relative">
                  <input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required
                    className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                  <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">New Password</label>
                <div className="relative">
                  <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required
                    className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                  <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition-all">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                  Update Password
                </button>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button onClick={async () => {
                const ok = await confirm({
                  title: 'Sign Out',
                  message: 'Are you sure you want to sign out of all devices?',
                  confirmText: 'Sign Out',
                  variant: 'primary',
                });
                if (ok) { await logout(); }
              }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold transition-all">
                <LogOut className="h-3.5 w-3.5" />
                Sign Out of All Devices
              </button>
            </div>
          </div>

          {/* Safe Workspace Deletion - Danger Zone */}
          {activeWorkspace && (activeWorkspace.ownerId === user?.id || user?.role === 'admin') && (
            <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 flex items-center justify-center text-red-600 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-red-600 dark:text-red-400">Danger Zone: Delete Workspace</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Permanently remove <strong className="text-slate-800 dark:text-slate-200">"{activeWorkspace.name}"</strong> and all its access records.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 shrink-0">
                  Protected & Irreversible
                </span>
              </div>

              <div className="p-3.5 bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-800 dark:text-red-200">Safeguard Warning:</p>
                  <p className="leading-relaxed">
                    Deleting this workspace will revoke access for all team members and erase all workspace assignments. Only the workspace owner or system administrator can perform this action.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteConfirmChecked}
                    onChange={e => setDeleteConfirmChecked(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span>I understand and confirm that this action cannot be undone.</span>
                </label>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Type "{activeWorkspace?.name}" to confirm deletion
                  </label>
                  <input
                    value={deleteConfirmName}
                    onChange={e => setDeleteConfirmName(e.target.value)}
                    placeholder={activeWorkspace?.name}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-950 transition-all font-mono"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleDeleteWorkspace}
                    disabled={deletingWorkspace || !deleteConfirmChecked || deleteConfirmName !== activeWorkspace?.name}
                    className="flex items-center gap-1.5 px-4 py-2 border border-transparent bg-red-600 hover:bg-red-700 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    {deletingWorkspace ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete Workspace
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
