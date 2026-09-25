'use client';

import React, { useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { User } from '@/context/AuthContext';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  currentUser: User;
  onChatCreated: (chat: any) => void;
}

export default function CreateChatModal({
  isOpen,
  onClose,
  users,
  currentUser,
  onChatCreated
}: CreateChatModalProps) {
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter out current user from selection candidates, and search only if search query is entered
  const candidates = searchQuery.trim() === ''
    ? []
    : users.filter(
        (u) =>
          u.id !== currentUser.id &&
          !u.disabled &&
          (u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
      );

  const handleToggleUser = (userId: string) => {
    if (isGroup) {
      if (selectedUsers.includes(userId)) {
        setSelectedUsers(selectedUsers.filter((id) => id !== userId));
      } else {
        setSelectedUsers([...selectedUsers, userId]);
      }
    } else {
      // Direct Message - select only one
      setSelectedUsers([userId]);
    }
  };

  const handleCreate = async () => {
    if (isGroup && !groupName.trim()) {
      setError('Please provide a group name');
      return;
    }
    if (selectedUsers.length === 0) {
      setError('Please select at least one user');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: isGroup ? groupName.trim() : null,
          isGroup,
          participants: selectedUsers
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create conversation');
      }

      onChatCreated(data);
      onClose();
      // Reset
      setGroupName('');
      setSelectedUsers([]);
      setIsGroup(false);
    } catch (err: any) {
      setError(err.message || 'Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md glass border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Start New Chat
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Select */}
        <div className="p-4 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200/30 dark:border-slate-800/30 flex gap-2">
          <button
            onClick={() => {
              setIsGroup(false);
              setSelectedUsers([]);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-all ${
              !isGroup
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-md font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Direct Message
          </button>
          <button
            onClick={() => {
              setIsGroup(true);
              setSelectedUsers([]);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold tracking-wider uppercase transition-all ${
              isGroup
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-md font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Group Chat
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </div>
          )}

          {isGroup && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Group Name
              </label>
              <input
                type="text"
                placeholder="e.g. Engineering Team"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="block w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-base md:text-sm transition-all"
              />
            </div>
          )}

          {/* Search User */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Select {isGroup ? 'Participants' : 'User'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="Search username or display name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-base md:text-sm transition-all"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          {/* Users List */}
          <div className="space-y-2 max-h-[25vh] overflow-y-auto pr-1">
            {searchQuery.trim() === '' ? (
              <p className="text-center py-6 text-sm text-slate-400">Type a name above to search for users...</p>
            ) : candidates.length === 0 ? (
              <p className="text-center py-6 text-sm text-slate-400">No users found</p>
            ) : (
              candidates.map((user) => {
                const isSelected = selectedUsers.includes(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => handleToggleUser(user.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-50 font-bold'
                        : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="relative flex-shrink-0 w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold overflow-hidden">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        user.displayName[0].toUpperCase()
                      )}
                      {user.status === 'online' && (
                        <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-950" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {user.displayName}
                      </p>
                      <p className="text-xs text-slate-400 truncate">@{user.username}</p>
                    </div>
                    <input
                      type={isGroup ? 'checkbox' : 'radio'}
                      checked={isSelected}
                      readOnly
                      className="h-4 w-4 rounded-sm text-neutral-950 dark:text-neutral-50 focus:ring-neutral-950 border-slate-300 dark:border-neutral-700"
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-all"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || selectedUsers.length === 0}
            className="flex-1 py-2 bg-neutral-950 hover:bg-neutral-900 dark:bg-neutral-50 dark:hover:bg-neutral-100 disabled:opacity-50 text-white dark:text-neutral-950 text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center border border-transparent dark:border-neutral-850"
          >
            {loading ? (
              <Loader2 className="animate-spin h-4 w-4" />
            ) : (
              `Create ${isGroup ? 'Group' : 'Chat'}`
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
