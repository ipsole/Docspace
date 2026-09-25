'use client';

import React, { useState, useRef } from 'react';
import { X, Camera, Loader2, Check } from 'lucide-react';
import { User, useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, updateUserContext, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [status, setStatus] = useState<'online' | 'offline' | 'away'>(user?.status || 'online');
  
  // Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          status
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      updateUserContext(data);
      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all password fields');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar must be under 5MB');
      return;
    }

    setAvatarLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'avatar');

    try {
      // 1. Upload file
      const uploadRes = await fetch('/api/files', {
        method: 'POST',
        body: formData
      });

      const fileData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(fileData.error || 'Upload failed');
      }

      // 2. Update user profile details
      const userRes = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: fileData.url })
      });

      const updatedUser = await userRes.json();
      if (!userRes.ok) {
        throw new Error(updatedUser.error || 'Failed to save avatar');
      }

      updateUserContext(updatedUser);
      setSuccess('Avatar updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to upload avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl glass border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Settings
            </h3>
            <p className="text-xs text-slate-400">Manage your profile, theme, and security settings</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Panel split */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-5 gap-6">
          
          {/* Left panel (Avatar / Theme picker) */}
          <div className="md:col-span-2 flex flex-col items-center space-y-6 border-b md:border-b-0 md:border-r border-slate-200/50 dark:border-slate-800/50 pb-6 md:pb-0 md:pr-6">
            
            {/* Avatar Section */}
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              <div className="w-28 h-28 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-extrabold flex items-center justify-center text-3xl border-2 border-neutral-950 dark:border-neutral-50 overflow-hidden relative">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} className="w-full h-full object-cover animate-fade-in" />
                ) : (
                  user.displayName[0].toUpperCase()
                )}
                {avatarLoading && (
                  <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center text-white">
                    <Loader2 className="animate-spin h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="absolute inset-0 rounded-full bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Camera className="h-6 w-6" />
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={avatarLoading}
              />
            </div>
            <div className="text-center">
              <h4 className="font-bold text-slate-700 dark:text-slate-200">{user.displayName}</h4>
              <p className="text-xs text-slate-400">@{user.username}</p>
            </div>


            {/* Custom Status */}
            <div className="w-full">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Presence Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-neutral-950 dark:focus:ring-neutral-50"
              >
                <option value="online">🟢 Online</option>
                <option value="away">🟡 Away</option>
                <option value="offline">⚫ Offline</option>
              </select>
            </div>

          </div>

          {/* Right panel (Profile Details & Password updates) */}
          <div className="md:col-span-3 space-y-6">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-600 dark:text-red-400 font-medium">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-2">
                <Check className="h-4 w-4" />
                {success}
              </div>
            )}

            {/* Profile Info Form */}
            <form onSubmit={handleProfileSave} className="space-y-4">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2">
                Profile Details
              </h4>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="block w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 dark:focus:ring-neutral-50 text-base md:text-sm transition-all"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Bio / Status Message
                </label>
                <textarea
                  placeholder="Tell people about yourself..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 dark:focus:ring-neutral-50 text-base md:text-sm transition-all"
                  disabled={loading}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 dark:bg-neutral-50 dark:hover:bg-neutral-100 disabled:opacity-50 text-white dark:text-neutral-950 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border border-transparent dark:border-neutral-800 shadow"
                >
                  {loading && <Loader2 className="animate-spin h-3.5 w-3.5" />}
                  Save Profile
                </button>
              </div>
            </form>

            {/* Change Password Form */}
            <form onSubmit={handlePasswordSave} className="space-y-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2">
                Change Password
              </h4>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 dark:focus:ring-neutral-50 text-base md:text-sm"
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 dark:focus:ring-neutral-50 text-base md:text-sm"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 dark:focus:ring-neutral-50 text-base md:text-sm"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-neutral-950 hover:bg-neutral-900 dark:bg-neutral-50 dark:hover:bg-neutral-100 disabled:opacity-50 text-white dark:text-neutral-950 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border border-transparent dark:border-neutral-800 shadow"
                >
                  {loading && <Loader2 className="animate-spin h-3.5 w-3.5" />}
                  Change Password
                </button>
              </div>
            </form>

          </div>

        </div>

      </div>
    </div>
  );
}
