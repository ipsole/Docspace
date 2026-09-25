'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Lock, Phone } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const { loginWithGoogle, user } = useAuth();
  const router = useRouter();

  // If already logged in, redirect to dashboard
  React.useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setGoogleLoading(true);
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in was cancelled.');
      } else {
        setError(err.message || 'Google authentication failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f5f7] text-[#111827]">
      {/* Modern Card Login Console */}
      <div className="w-full max-w-md neu-raised rounded-[2.5rem] p-8 sm:p-10 space-y-6">
        {/* Top Logo / Status Capsule */}
        <div className="flex items-center justify-between">
          <div className="neu-inset rounded-full px-4 py-1.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#34c759]" />
            <span className="text-[11px] font-black text-[#466380]">DocSpace Node</span>
          </div>
          <div className="neu-circle-btn h-9 w-9 bg-[#34c759] text-white">
            <Phone className="h-3.5 w-3.5 fill-white" />
          </div>
        </div>

        {/* Header */}
        <div className="text-center py-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 mb-3 shadow-2xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#2d3748] tracking-tight">
            Workstation Sign In
          </h1>
          <p className="text-xs text-[#718096] font-semibold mt-1">
            Access restricted to authorized owner and team members
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl neu-inset text-red-600 text-xs font-bold text-center leading-relaxed">
            {error}
          </div>
        )}

        {/* GOOGLE SIGN IN BUTTON */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full neu-btn py-4 px-5 rounded-2xl text-xs sm:text-sm font-black text-[#2d3748] flex items-center justify-center gap-3 transition-all hover:bg-white active:scale-[0.99] cursor-pointer shadow-xs disabled:opacity-50"
          >
            {googleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#466380]" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
            )}
            <span>{googleLoading ? 'Verifying with Google...' : 'Sign in with Google'}</span>
          </button>
        </div>

        {/* Security Badge */}
        <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800/50">
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-[#718096]">
            <Lock className="w-3.5 h-3.5 text-[#34c759]" />
            <span>Google Single Sign-On Only</span>
          </div>
          <p className="text-[10px] text-[#a0aec0] text-center mt-1 leading-normal">
            Password logins and public signups are disabled. Only Google accounts pre-approved by the owner can enter.
          </p>
        </div>
      </div>
    </div>
  );
}
