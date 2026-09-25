'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { 
  Search, LayoutDashboard, MessageSquare, Briefcase, Users, 
  FileText, CreditCard, Calendar, Settings, LogOut, ArrowRight,
  Terminal, Target, ReceiptText, Globe, FileSpreadsheet
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const { workspaces, setActiveWorkspace } = useWorkspace();
  
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        setQuery('');
        setSelectedIndex(0);
      }, 50);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  const pages = [
    { name: 'Go to Dashboard', href: '/dashboard', icon: LayoutDashboard, category: 'Navigation' },
    { name: 'Go to Chats', href: '/chats', icon: MessageSquare, category: 'Navigation' },
    { name: 'Go to Projects', href: '/projects', icon: Briefcase, category: 'Navigation' },
    { name: 'Go to Calendar', href: '/calendar', icon: Calendar, category: 'Navigation' },
    { name: 'Go to Leads Pipeline', href: '/leads', icon: Target, category: 'Navigation' },
    { name: 'Go to Clients', href: '/clients', icon: Users, category: 'Navigation' },
    { name: 'Go to Invoices & Receivables', href: '/invoices', icon: ReceiptText, category: 'Navigation' },
    { name: 'Go to White-labeling', href: '/white-label', icon: Globe, category: 'Navigation' },
    { name: 'Go to Business Billing & Expenses', href: '/billing', icon: FileSpreadsheet, category: 'Navigation' },
    { name: 'Go to Storage', href: '/storage', icon: FileText, category: 'Navigation' },
    { name: 'Go to Settings', href: '/settings', icon: Settings, category: 'Navigation' },
  ];

  const actions = [
    { 
      name: 'Logout from DocSpace', 
      action: async () => { if (confirm('Are you sure you want to sign out?')) { await logout(); onClose(); } }, 
      icon: LogOut, 
      category: 'System Actions' 
    }
  ];

  // Map workspace switches
  const workspaceItems = workspaces.map(ws => ({
    name: `Switch to Workspace: ${ws.name}`,
    action: () => { setActiveWorkspace(ws); onClose(); },
    icon: Terminal,
    category: 'Workspaces'
  }));

  // Combine items
  const items = [
    ...pages.map(p => ({
      name: p.name,
      action: () => { router.push(p.href); onClose(); },
      icon: p.icon,
      category: p.category
    })),
    ...workspaceItems,
    ...actions
  ];

  // Filter based on search query
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          {/* Backdrop overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px]"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[50vh]"
          >
            {/* Search Input field */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-850">
              <Search className="h-5 w-5 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a command or search workspace features..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className="w-full text-sm bg-transparent border-none text-slate-850 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-0"
              />
              <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 border border-slate-200 dark:border-slate-800 rounded">ESC</span>
            </div>

            {/* List results */}
            <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                  No commands found matching &ldquo;{query}&rdquo;
                </div>
              ) : (
                <div className="space-y-2">
                  {/* We group by category dynamically */}
                  {Object.entries(
                    filteredItems.reduce((groups, item) => {
                      const group = groups[item.category] || [];
                      group.push(item);
                      groups[item.category] = group;
                      return groups;
                    }, {} as Record<string, typeof filteredItems>)
                  ).map(([category, catItems]) => (
                    <div key={category}>
                      <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {category}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {catItems.map((item) => {
                          // Find index in final filteredItems list
                          const globalIdx = filteredItems.indexOf(item);
                          const isSelected = globalIdx === selectedIndex;
                          const Icon = item.icon;

                          return (
                            <button
                              key={item.name}
                              onClick={item.action}
                              onMouseEnter={() => setSelectedIndex(globalIdx)}
                              className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm transition-all text-left ${
                                isSelected 
                                  ? 'bg-indigo-600 text-white shadow-md' 
                                  : 'text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                <Icon className={`h-4.5 w-4.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                                <span>{item.name}</span>
                              </span>
                              {isSelected && (
                                <span className="text-[10px] font-bold tracking-wider flex items-center gap-1">
                                  Select <ArrowRight className="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Keyboard helper footer */}
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-850 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between text-[10px] text-slate-450 dark:text-slate-500">
              <span className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Enter</span>
              </span>
              <span>DocSpace Command Line v1.0</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
