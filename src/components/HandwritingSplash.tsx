'use client';

import React, { useEffect, useState } from 'react';

export default function HandwritingSplash() {
  const [visible, setVisible] = useState(true);
  const [started, setStarted] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start animation on page load/refresh
    const startTimer = setTimeout(() => {
      setStarted(true);
    }, 50);

    // Timeline:
    // 0.00s - 1.40s: Handwriting writes out smoothly across the screen
    // 1.40s - 2.05s: Completed signature rests gracefully in center (0.65s view)
    // 2.05s - 2.50s: Smooth fade-out transition into dashboard (0.45s)
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 2050);

    const removeTimer = setTimeout(() => {
      setVisible(false);
    }, 2500);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-9999 flex flex-col items-center justify-center bg-[#f4f5f7] dark:bg-slate-950 transition-all duration-450 ease-out select-none ${
        fading ? 'opacity-0 scale-102 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      <div className="relative flex flex-col items-center justify-center p-8 overflow-visible">
        {/* Subtle ambient background glow */}
        <div className="absolute w-80 h-80 rounded-full bg-slate-200/50 dark:bg-slate-800/30 blur-3xl -z-10 pointer-events-none" />

        {/* Center cursive handwriting logo (overflow-visible to prevent any glyph clipping) */}
        <div className="relative overflow-visible px-8 py-6">
          <div className={started ? 'handwriting-anim overflow-visible' : 'opacity-0 overflow-visible'}>
            <h1 className="text-[76px] sm:text-[100px] md:text-[116px] font-dearllane font-normal text-gray-950 dark:text-white tracking-normal leading-[1.35] py-4 select-none drop-shadow-xs overflow-visible">
              Docspace
            </h1>
          </div>
        </div>

        {/* Delicate ink dot accent */}
        <div className="mt-1 flex items-center justify-center gap-1.5 opacity-60">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-ping" />
        </div>
      </div>
    </div>
  );
}
