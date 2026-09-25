import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { 
  readSession, 
  createSession, 
  deleteSession, 
  readUser, 
  User, 
  Session 
} from './storage/storage';

const COOKIE_NAME = 'docspace_session';

/**
 * Hashes a plain text password.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verifies a plain text password against a hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Creates a session for a user and sets an HTTP-only cookie.
 */
export async function startSession(
  userId: string,
  username: string,
  rememberMe: boolean = false
): Promise<Session> {
  const sessionId = uuidv4();
  
  // Set expiration (30 days if rememberMe, otherwise 24 hours)
  const duration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + duration).toISOString();

  const session: Session = {
    id: sessionId,
    userId,
    username,
    createdAt: new Date().toISOString(),
    expiresAt
  };

  // Save to file storage
  await createSession(session);

  // Set Cookie dynamically based on protocol
  const cookieStore = await cookies();
  const headersList = await headers();
  const proto = headersList.get('x-forwarded-proto') || '';
  const host = headersList.get('host') || '';
  
  // Set secure flag if tunneled via Cloudflare/HTTPS or running on domain / production
  const isSecure = proto === 'https' || host.includes('docdril.com') || (process.env.NODE_ENV === 'production' && !host.includes('localhost'));
  
  console.log('COOKIE_DEBUG:', { proto, host, isSecure, env: process.env.NODE_ENV });

  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60 // seconds
  });

  return session;
}

/**
 * Destroys the session and clears the cookie.
 */
export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (sessionId) {
    await deleteSession(sessionId);
  }
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Gets the current logged-in user based on the request's cookies.
 */
export async function getCurrentUser(request?: NextRequest): Promise<User | null> {
  let sessionId: string | undefined;

  if (request) {
    sessionId = request.cookies.get(COOKIE_NAME)?.value;
  } else {
    const cookieStore = await cookies();
    sessionId = cookieStore.get(COOKIE_NAME)?.value;
  }

  if (!sessionId) return null;

  const session = await readSession(sessionId);
  if (!session) return null;

  return await readUser(session.userId);
}
