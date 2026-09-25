import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import { STORAGE_ROOT, ensureDirs } from './storage';
import { logInfo, logError } from './logger';

const BACKUP_DIR = path.join(STORAGE_ROOT, 'backups');

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * Creates a zip backup of the entire local database directories.
 */
export async function createBackup(): Promise<string> {
  await ensureDirs();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `backup_${timestamp}.zip`;
  const backupFilePath = path.join(BACKUP_DIR, backupFilename);

  const zip = new AdmZip();

  const foldersToBackup = [
    'users',
    'conversations',
    'messages',
    'settings',
    'memory',
    'uploads',
    'avatars'
  ];

  for (const folder of foldersToBackup) {
    const folderPath = path.join(STORAGE_ROOT, folder);
    try {
      // Check if folder exists and has items before adding
      const stats = await fs.stat(folderPath).catch(() => null);
      if (stats && stats.isDirectory()) {
        const files = await fs.readdir(folderPath);
        if (files.length > 0) {
          zip.addLocalFolder(folderPath, folder);
        }
      }
    } catch (err: any) {
      console.error(`Error zipping folder ${folder}:`, err);
    }
  }

  // Also include the log file events.jsonl if it exists
  const logFilePath = path.join(STORAGE_ROOT, 'logs', 'events.jsonl');
  try {
    const stats = await fs.stat(logFilePath).catch(() => null);
    if (stats && stats.isFile()) {
      zip.addLocalFile(logFilePath, 'logs');
    }
  } catch (err) {
    console.error('Error zipping logs:', err);
  }

  await zip.writeZipPromise(backupFilePath);
  
  const size = (await fs.stat(backupFilePath)).size;
  await logInfo('ADMIN', 'Backup created successfully', { filename: backupFilename, sizeBytes: size });

  return backupFilename;
}

/**
 * Lists all available backup files.
 */
export async function listBackups(): Promise<BackupInfo[]> {
  await ensureDirs();
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (file.startsWith('backup_') && file.endsWith('.zip')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filePath);
        backups.push({
          filename: file,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString()
        });
      }
    }

    // Newest backups first
    return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Error listing backups:', error);
    return [];
  }
}

/**
 * Restores a backup. This will extract the zip contents, overwriting existing storage files.
 */
export async function restoreBackup(filename: string): Promise<void> {
  await ensureDirs();
  const backupFilePath = path.join(BACKUP_DIR, filename);

  // Validate backup file exists
  const stats = await fs.stat(backupFilePath).catch(() => null);
  if (!stats || !stats.isFile()) {
    throw new Error('Backup file not found');
  }

  try {
    const zip = new AdmZip(backupFilePath);
    
    // Extract zip contents directly to STORAGE_ROOT
    // AdmZip will overwrite files by default.
    zip.extractAllTo(STORAGE_ROOT, true);

    await logInfo('ADMIN', 'Backup restored successfully', { filename });
  } catch (error: any) {
    await logError('ADMIN', 'Backup restoration failed', { filename, error: error.message });
    throw error;
  }
}

/**
 * Deletes a backup file.
 */
export async function deleteBackup(filename: string): Promise<void> {
  await ensureDirs();
  const backupFilePath = path.join(BACKUP_DIR, filename);
  try {
    await fs.unlink(backupFilePath);
    await logInfo('ADMIN', 'Backup file deleted', { filename });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}
