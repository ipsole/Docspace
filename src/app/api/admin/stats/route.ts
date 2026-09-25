import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { STORAGE_ROOT, listUsers, listConversations } from '@/lib/storage/storage';
import { getCurrentUser } from '@/lib/auth';

// Helper to recursively get directory size in bytes
async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        size += await getDirSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch {
    // Fail silently if directory doesn't exist
  }
  return size;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const users = await listUsers();
    const convos = await listConversations();

    // Count sessions
    let sessionCount = 0;
    try {
      const sessionFiles = await fs.readdir(path.join(STORAGE_ROOT, 'sessions'));
      sessionCount = sessionFiles.filter(f => f.endsWith('.json')).length;
    } catch {}

    // Calculate folder sizes
    const uploadsSize = await getDirSize(path.join(STORAGE_ROOT, 'uploads'));
    const avatarsSize = await getDirSize(path.join(STORAGE_ROOT, 'avatars'));
    const backupsSize = await getDirSize(path.join(STORAGE_ROOT, 'backups'));
    const dbSize = await getDirSize(path.join(STORAGE_ROOT, 'users')) + 
                   await getDirSize(path.join(STORAGE_ROOT, 'conversations')) + 
                   await getDirSize(path.join(STORAGE_ROOT, 'messages'));
    const logsSize = await getDirSize(path.join(STORAGE_ROOT, 'logs'));

    const totalStorageSize = uploadsSize + avatarsSize + backupsSize + dbSize + logsSize;

    // Get active (online) user count
    const onlineUsersCount = users.filter(u => u.status === 'online').length;

    return NextResponse.json({
      totalUsers: users.length,
      onlineUsers: onlineUsersCount,
      totalChats: convos.length,
      totalSessions: sessionCount,
      storageUsage: {
        totalBytes: totalStorageSize,
        uploadsBytes: uploadsSize,
        avatarsBytes: avatarsSize,
        backupsBytes: backupsSize,
        databaseBytes: dbSize,
        logsBytes: logsSize
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime() // in seconds
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
