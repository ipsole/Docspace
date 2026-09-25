import fs from 'fs/promises';
import path from 'path';
import { STORAGE_ROOT, ensureDirs } from './storage';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogCategory = 'SYSTEM' | 'AUTH' | 'CHAT' | 'FILE' | 'ADMIN';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, any>;
}

const LOG_FILE = path.join(STORAGE_ROOT, 'logs', 'events.jsonl');

/**
 * Appends a log entry to the JSONL log file.
 */
export async function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    await ensureDirs();
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details
    };

    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(LOG_FILE, line, 'utf-8');
  } catch (error) {
    console.error('Failed to write log entry:', error);
  }
}

export async function logInfo(category: LogCategory, message: string, details?: Record<string, any>) {
  return log('INFO', category, message, details);
}

export async function logWarn(category: LogCategory, message: string, details?: Record<string, any>) {
  return log('WARN', category, message, details);
}

export async function logError(category: LogCategory, message: string, details?: Record<string, any>) {
  return log('ERROR', category, message, details);
}

/**
 * Reads logs from the events.jsonl file, supporting pagination and text filtering.
 */
export async function readLogs(
  options: {
    limit?: number;
    offset?: number;
    level?: LogLevel;
    category?: LogCategory;
    query?: string;
  } = {}
): Promise<{ logs: LogEntry[]; total: number }> {
  await ensureDirs();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  try {
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    const lines = data.trim().split('\n').filter(Boolean);
    const parsedLogs: LogEntry[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as LogEntry;
        
        // Filter by Level
        if (options.level && parsed.level !== options.level) continue;
        
        // Filter by Category
        if (options.category && parsed.category !== options.category) continue;

        // Filter by text search query
        if (options.query) {
          const queryLower = options.query.toLowerCase();
          const matchMessage = parsed.message.toLowerCase().includes(queryLower);
          const matchDetails = parsed.details ? JSON.stringify(parsed.details).toLowerCase().includes(queryLower) : false;
          if (!matchMessage && !matchDetails) continue;
        }

        parsedLogs.push(parsed);
      } catch {
        // ignore malformed lines
      }
    }

    // Newest logs first
    parsedLogs.reverse();

    const total = parsedLogs.length;
    const paginated = parsedLogs.slice(offset, offset + limit);

    return {
      logs: paginated,
      total
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { logs: [], total: 0 };
    }
    throw error;
  }
}
