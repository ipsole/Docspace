import fs from 'fs/promises';
import path from 'path';
import { safeReadFile, safeWriteFile, safeDeleteFile, STORAGE_ROOT } from '../storage/storage';
import { isFirestoreEnabled, firestoreList } from '../storage/firestoreAdapter';
import { v4 as uuidv4 } from 'uuid';

export interface CalendarEvent {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  type: 'event' | 'meeting';
  location: string;
  members: string[]; // User IDs participating
  createdAt: string;
  clientId?: string;
}

const CALENDAR_DIR = path.join(STORAGE_ROOT, 'calendar');

// Ensure directories exist
async function ensureDirs() {
  await fs.mkdir(CALENDAR_DIR, { recursive: true });
}

export async function listEvents(workspaceId: string): Promise<CalendarEvent[]> {
  if (isFirestoreEnabled()) {
    const events = await firestoreList<CalendarEvent>('calendar');
    return events
      .filter(e => e && e.workspaceId === workspaceId)
      .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  }

  await ensureDirs();
  const files = await fs.readdir(CALENDAR_DIR).catch(() => []);
  const events: CalendarEvent[] = [];
  const clientsDir = path.join(STORAGE_ROOT, 'clients');

  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('._')) {
      const filePath = path.join(CALENDAR_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const ev = JSON.parse(content) as CalendarEvent;
          if (ev.workspaceId === workspaceId) {
            if (ev.clientId) {
              const clientFile = path.join(clientsDir, `${ev.clientId}.json`);
              const clientExists = await fs.stat(clientFile).then(() => true).catch(() => false);
              if (!clientExists) {
                // Non-existing client! Never store or return events for non-existing clients
                await safeDeleteFile(filePath);
                continue;
              }
            }
            events.push(ev);
          }
        } catch {}
      }
    }
  }

  return events.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(a.startDateTime).getTime());
}

export async function createEvent(
  workspaceId: string,
  data: Omit<CalendarEvent, 'id' | 'workspaceId' | 'createdAt'>
): Promise<CalendarEvent> {
  await ensureDirs();
  if (data.clientId) {
    const clientsDir = path.join(STORAGE_ROOT, 'clients');
    const clientExists = await fs.stat(path.join(clientsDir, `${data.clientId}.json`)).then(() => true).catch(() => false);
    if (!clientExists) {
      throw new Error(`Cannot create event: client ${data.clientId} does not exist in clients directory`);
    }
  }

  const id = uuidv4();
  
  const event: CalendarEvent = {
    id,
    workspaceId,
    ...data,
    createdAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(CALENDAR_DIR, `${id}.json`), JSON.stringify(event, null, 2));
  return event;
}

export async function deleteEvent(id: string): Promise<void> {
  await safeDeleteFile(path.join(CALENDAR_DIR, `${id}.json`));
}
