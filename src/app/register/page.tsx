'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Lock, Mail, User, ArrowRight, ShieldCheck } from 'lucide-react';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, user } = useAuth();
  const router = useRouter();

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !displayName || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await register(
        username.trim().toLowerCase(),
        displayName.trim(),
        email.trim().toLowerCase(),
        password
      );
    } catch (err: any) {
      setError(err.message || 'Registration failed. Try a different username or email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f5f7] text-[#111827]">
      {/* Modern Register Console */}
      <div className="w-full max-w-md neu-raised rounded-[2.5rem] p-8 sm:p-10 space-y-5">
        {/* Top Header */}
        <div className="text-center py-2">
          <div className="neu-inset rounded-full px-4 py-1.5 inline-flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-[#007aff]" />
            <span className="text-[11px] font-black text-[#466380]">New Workstation Profile</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#2d3748] tracking-tight">
            Create Profile
          </h1>
          <p className="text-xs text-[#718096] font-semibold mt-1">
            Setup your local operator account
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl neu-inset text-red-600 text-xs font-bold text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Display Name */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#718096]">
              Display Name
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Wanda Azhari"
              className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748] placeholder-[#94a3b8]"
            />
          </div>

          {/* Username */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#718096]">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. wanda"
              className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748] placeholder-[#94a3b8]"
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-[#718096]">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. wanda@workspace.local"
              className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748] placeholder-[#94a3b8]"
            />
          </div>

          {/* Password */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#718096]">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748] placeholder-[#94a3b8]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#718096]">
                Confirm
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-2.5 neu-input rounded-2xl text-xs font-semibold text-[#2d3748] placeholder-[#94a3b8]"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full neu-btn py-3.5 rounded-2xl text-xs font-black text-[#466380] flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Initialize Account</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center text-xs text-[#718096] font-semibold pt-2">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-black text-[#466380] hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
