'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

interface StatusOption {
  value: TaskStatus;
  label: string;
  dot: string;
  badgeBg: string;
  textColor: string;
}

const STATUS_CONFIG: Record<TaskStatus, StatusOption> = {
  todo: {
    value: 'todo',
    label: 'Not Started',
    dot: 'bg-amber-400',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
    textColor: 'text-amber-700 dark:text-amber-300'
  },
  in_progress: {
    value: 'in_progress',
    label: 'In Progress',
    dot: 'bg-blue-400',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40',
    textColor: 'text-blue-700 dark:text-blue-300'
  },
  review: {
    value: 'review',
    label: 'Review',
    dot: 'bg-purple-400',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/40',
    textColor: 'text-purple-700 dark:text-purple-300'
  },
  done: {
    value: 'done',
    label: 'Completed',
    dot: 'bg-emerald-400',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    textColor: 'text-emerald-700 dark:text-emerald-300'
  }
};

const STATUS_LIST: StatusOption[] = [
  STATUS_CONFIG.todo,
  STATUS_CONFIG.in_progress,
  STATUS_CONFIG.review,
  STATUS_CONFIG.done
];

interface TaskStatusDropdownProps {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  className?: string;
}

export default function TaskStatusDropdown({
  status,
  onChange,
  disabled = false,
  className = ''
}: TaskStatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 144;
    const menuHeight = 150;

    // Check space below vs above
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < menuHeight && rect.top > menuHeight;

    const top = showAbove
      ? Math.max(8, rect.top - menuHeight - 4)
      : Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8);

    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));

    setCoords({ top, left });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleDismiss = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    const handleReposition = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    document.addEventListener('mousedown', handleDismiss);
    document.addEventListener('touchstart', handleDismiss);
    document.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('touchstart', handleDismiss);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const current = STATUS_CONFIG[status] || STATUS_CONFIG.todo;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none transition-all shrink-0 cursor-pointer flex items-center gap-1.5 shadow-2xs ${className}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${current.dot}`} />
        <span className="whitespace-nowrap">{current.label}</span>
        <ChevronDown className={`h-3 w-3 text-slate-400 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {mounted && isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 99999,
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1 text-xs animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/5 dark:ring-white/5"
        >
          {STATUS_LIST.map((opt) => {
            const isSelected = opt.value === status;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between text-[11px] font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-white' : opt.dot}`} />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-white" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
