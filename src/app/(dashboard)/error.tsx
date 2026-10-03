'use client';

import React, { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error Boundary]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center text-slate-800 dark:text-slate-200">
      <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
        Unable to load this section
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-5">
        A temporary error occurred while displaying this page. You can try refreshing the tab or navigating to another workspace section.
      </p>
      <button
        onClick={() => reset()}
        className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry Loading
      </button>
    </div>
  );
}
