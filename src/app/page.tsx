'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100">
      <Loader2 className="animate-spin h-10 w-10 text-indigo-500 mb-4" />
      <p className="text-sm font-semibold tracking-wider uppercase text-slate-500 animate-pulse">
        Initializing Workspace...
      </p>
    </div>
  );
}
