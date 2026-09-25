'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  avatar: string | null;
  lastSeen: string;
  status: 'online' | 'offline' | 'away';
  preferences: Record<string, any>;
  theme: 'light' | 'dark' | 'system';
  role: 'admin' | 'user';
  bio: string;
  disabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string, rememberMe: boolean) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  register: (username: string, displayName: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserContext: (updatedUser: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Load current user session on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  };

  const login = async (usernameOrEmail: string, password: string, rememberMe: boolean): Promise<User> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password, rememberMe })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    setUser(data);
    router.replace('/dashboard');
    return data;
  };

  const loginWithGoogle = async (): Promise<User> => {
    const { signInWithPopup } = await import('firebase/auth');
    const { auth, googleProvider } = await import('@/lib/firebase/client');
    const result = await signInWithPopup(auth, googleProvider);
    const idToken = await result.user.getIdToken();

    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Server returned status ${res.status}: ${rawText.slice(0, 80).replace(/<[^>]*>/g, '').trim() || 'Internal Error'}`);
    }

    if (!res.ok) {
      // Sign out from Firebase if server rejected authorization
      const { signOut } = await import('firebase/auth');
      await signOut(auth).catch(() => {});
      throw new Error(data.error || 'Google login failed');
    }

    setUser(data);
    router.replace('/dashboard');
    return data;
  };

  const register = async (username: string, displayName: string, email: string, password: string): Promise<User> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    setUser(data);
    router.replace('/dashboard');
    return data;
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('@/lib/firebase/client');
      await signOut(auth).catch(() => {});
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      router.replace('/login');
    }
  };

  const updateUserContext = (updatedUser: User) => {
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, register, logout, refreshUser, updateUserContext }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
