'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface CustomDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  prefix?: React.ReactNode;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  title?: string;
  align?: 'left' | 'right';
}

export default function CustomDropdown({
  value,
  onChange,
  options,
  placeholder,
  prefix,
  className = '',
  buttonClassName,
  menuClassName = '',
  title,
  align = 'left',
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
      return () => {
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('touchstart', handleOutsideClick);
      };
    }
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || value);

  return (
    <div className={`relative shrink-0 ${isOpen ? 'z-50' : 'z-10'} ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={
          buttonClassName ||
          "text-[9px] font-semibold bg-white dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded-lg px-2.5 py-1 focus:outline-none text-slate-600 dark:text-slate-350 cursor-pointer shrink-0 flex items-center gap-1.5 transition-all hover:border-slate-300 dark:hover:border-slate-700"
        }
        title={title}
      >
        {prefix}
        <span className="truncate max-w-[150px]">{displayLabel}</span>
        <ChevronDown className={`h-3 w-3 text-slate-400 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 min-w-[140px] max-w-[calc(100vw-2rem)] max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 ${menuClassName}`}
        >
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] transition-colors cursor-pointer ${
                  isSelected
                    ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {opt.icon}
                  <span className="truncate">{opt.label}</span>
                  {typeof opt.count === 'number' && (
                    <span className="text-[9px] text-slate-400 font-normal">({opt.count})</span>
                  )}
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
