'use client';

import React from 'react';

export default function SkeletonScreen({ title = 'Loading...' }: { title?: string }) {
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10 animate-in fade-in duration-200">
      {/* 1. Header Banner Skeleton */}
      <div className="bg-gray-50/60 dark:bg-slate-900/60 border border-gray-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-2.5">
        <div className="h-6 w-48 rounded-lg skeleton-shimmer" />
        <div className="h-3.5 w-72 rounded-md skeleton-shimmer opacity-70" />
      </div>

      {/* 2. Top Metric Cards (4 Grid Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(idx => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/80 dark:border-slate-800 p-4 flex flex-col justify-between space-y-4 shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="h-9 w-9 rounded-xl skeleton-shimmer" />
              <div className="h-4 w-4 rounded-md skeleton-shimmer opacity-50" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-20 rounded-md skeleton-shimmer" />
              <div className="h-6 w-28 rounded-lg skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>

      {/* 3. Main Dual Content Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
            <div className="h-5 w-36 rounded-md skeleton-shimmer" />
            <div className="h-4 w-16 rounded-md skeleton-shimmer opacity-60" />
          </div>
          <div className="space-y-3 pt-1">
            {[1, 2, 3, 4].map(row => (
              <div
                key={row}
                className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-slate-800/80 bg-gray-50/40 dark:bg-slate-800/30"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg skeleton-shimmer shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-32 rounded-md skeleton-shimmer" />
                    <div className="h-2.5 w-20 rounded-md skeleton-shimmer opacity-60" />
                  </div>
                </div>
                <div className="h-5 w-16 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column (1 span) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
            <div className="h-5 w-28 rounded-md skeleton-shimmer" />
            <div className="h-4 w-12 rounded-md skeleton-shimmer opacity-60" />
          </div>
          <div className="space-y-3 pt-1">
            {[1, 2, 3].map(item => (
              <div
                key={item}
                className="p-3 rounded-xl border border-gray-100 dark:border-slate-800/80 space-y-2 bg-gray-50/40 dark:bg-slate-800/30"
              >
                <div className="h-3.5 w-3/4 rounded-md skeleton-shimmer" />
                <div className="h-2.5 w-1/2 rounded-md skeleton-shimmer opacity-60" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
