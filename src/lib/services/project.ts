import fs from 'fs/promises';
import path from 'path';
import { Project, Task } from '../storage/models';
import { safeReadFile, safeWriteFile, safeDeleteFile, STORAGE_ROOT } from '../storage/storage';
import { isFirestoreEnabled, firestoreList, firestoreGet } from '../storage/firestoreAdapter';
import { getClient } from './crm';
import { v4 as uuidv4 } from 'uuid';

const PROJECTS_DIR = path.join(STORAGE_ROOT, 'projects');
const TASKS_DIR = path.join(STORAGE_ROOT, 'tasks');

// Ensure directories exist safely without throwing on read-only environments
async function ensureDirs() {
  if (process.env.VERCEL || isFirestoreEnabled()) return;
  try {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
    await fs.mkdir(TASKS_DIR, { recursive: true });
  } catch (err: any) {
    if (err?.code !== 'EROFS') throw err;
  }
}

// --- PROJECT OPERATIONS ---

export async function listProjects(workspaceId: string): Promise<Project[]> {
  if (isFirestoreEnabled()) {
    const projects = await firestoreList<Project>('projects');
    return projects
      .filter(p => p && p.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  await ensureDirs();
  const files = await fs.readdir(PROJECTS_DIR).catch(() => []);
  const projects: Project[] = [];
  const clientsDir = path.join(STORAGE_ROOT, 'clients');

  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('._')) {
      const filePath = path.join(PROJECTS_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const project = JSON.parse(content) as Project;
          if (project.workspaceId === workspaceId) {
            projects.push(project);
          }
        } catch {}
      }
    }
  }

  return projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getProject(id: string): Promise<Project | null> {
  if (isFirestoreEnabled()) {
    const proj = await firestoreGet<Project>('projects', id);
    if (proj) return proj;
  }
  await ensureDirs();
  const content = await safeReadFile(path.join(PROJECTS_DIR, `${id}.json`));
  if (!content) return null;
  return JSON.parse(content) as Project;
}

export async function createProject(
  workspaceId: string,
  data: Omit<Project, 'id' | 'workspaceId' | 'createdAt'>
): Promise<Project> {
  await ensureDirs();
  const id = uuidv4();
  const project: Project = {
    id,
    workspaceId,
    ...data,
    createdAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(PROJECTS_DIR, `${id}.json`), JSON.stringify(project, null, 2));
  return project;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const project = await getProject(id);
  if (!project) throw new Error('Project not found');

  const updatedProject = {
    ...project,
    ...updates
  };

  await safeWriteFile(path.join(PROJECTS_DIR, `${id}.json`), JSON.stringify(updatedProject, null, 2));
  return updatedProject;
}

export async function deleteProject(id: string): Promise<void> {
  await safeDeleteFile(path.join(PROJECTS_DIR, `${id}.json`));

  if (isFirestoreEnabled()) {
    const tasks = await firestoreList<Task>('tasks');
    for (const t of tasks) {
      if (t && t.projectId === id) {
        await safeDeleteFile(path.join(TASKS_DIR, `${t.id}.json`));
      }
    }
    return;
  }

  // Clean up any tasks associated with this project
  const files = await fs.readdir(TASKS_DIR).catch(() => []);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(TASKS_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const task = JSON.parse(content) as Task;
          if (task.projectId === id) {
            await safeDeleteFile(filePath);
          }
        } catch {}
      }
    }
  }
}

// Recalculates and updates the completion percentage of a project based on its tasks
export async function recalculateProjectProgress(projectId: string): Promise<number> {
  const tasks = await listTasksByProject(projectId);
  if (tasks.length === 0) return 0;

  const completed = tasks.filter(t => t.status === 'done').length;
  const progress = Math.round((completed / tasks.length) * 100);
  
  await updateProject(projectId, { progress });
  return progress;
}

// --- TASK OPERATIONS ---

export async function listTasks(workspaceId: string): Promise<Task[]> {
  if (isFirestoreEnabled()) {
    const tasks = await firestoreList<Task>('tasks');
    return tasks.filter(t => t && t.workspaceId === workspaceId);
  }

  await ensureDirs();
  const files = await fs.readdir(TASKS_DIR).catch(() => []);
  const tasks: Task[] = [];
  const clientsDir = path.join(STORAGE_ROOT, 'clients');

  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('._')) {
      const filePath = path.join(TASKS_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const task = JSON.parse(content) as Task;
          if (task.workspaceId === workspaceId) {
            if (task.clientId) {
              const clientFile = path.join(clientsDir, `${task.clientId}.json`);
              const clientExists = await fs.stat(clientFile).then(() => true).catch(() => false);
              if (!clientExists) {
                // Non-existing client: never store or return tasks for non-existing clients
                await safeDeleteFile(filePath);
                continue;
              }
            }
            tasks.push(task);
          }
        } catch {}
      }
    }
  }

  return tasks;
}

export async function listTasksByProject(projectId: string): Promise<Task[]> {
  if (isFirestoreEnabled()) {
    const tasks = await firestoreList<Task>('tasks');
    return tasks.filter(t => t && t.projectId === projectId);
  }

  await ensureDirs();
  const files = await fs.readdir(TASKS_DIR).catch(() => []);
  const tasks: Task[] = [];
  const clientsDir = path.join(STORAGE_ROOT, 'clients');

  for (const file of files) {
    if (file.endsWith('.json') && !file.startsWith('._')) {
      const filePath = path.join(TASKS_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const task = JSON.parse(content) as Task;
          if (task.projectId === projectId) {
            tasks.push(task);
          }
        } catch {}
      }
    }
  }

  return tasks;
}

export async function getTask(id: string): Promise<Task | null> {
  if (isFirestoreEnabled()) {
    const task = await firestoreGet<Task>('tasks', id);
    if (task) return task;
  }
  await ensureDirs();
  const content = await safeReadFile(path.join(TASKS_DIR, `${id}.json`));
  if (!content) return null;
  return JSON.parse(content) as Task;
}

export async function createTask(
  workspaceId: string,
  projectId: string,
  data: Omit<Task, 'id' | 'workspaceId' | 'projectId' | 'createdAt'>
): Promise<Task> {
  await ensureDirs();
  if (data.clientId) {
    try {
      const client = await getClient(data.clientId);
      if (!client) {
        console.warn(`Client ${data.clientId} not found when creating task, continuing.`);
      }
    } catch (e) {
      console.warn(`Error checking client ${data.clientId}:`, e);
    }
  }

  const id = uuidv4();
  const task: Task = {
    id,
    workspaceId,
    projectId,
    ...data,
    createdAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(TASKS_DIR, `${id}.json`), JSON.stringify(task, null, 2));
  
  // Update project progress
  await recalculateProjectProgress(projectId);
  
  return task;
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const task = await getTask(id);
  if (!task) throw new Error('Task not found');

  if (updates.clientId) {
    try {
      const client = await getClient(updates.clientId);
      if (!client) {
        console.warn(`Client ${updates.clientId} not found when updating task, continuing.`);
      }
    } catch (e) {
      console.warn(`Error checking client ${updates.clientId}:`, e);
    }
  }

  const updatedTask = {
    ...task,
    ...updates
  };

  await safeWriteFile(path.join(TASKS_DIR, `${id}.json`), JSON.stringify(updatedTask, null, 2));
  
  // Update project progress
  await recalculateProjectProgress(task.projectId);

  return updatedTask;
}

export async function deleteTask(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task) return;

  await safeDeleteFile(path.join(TASKS_DIR, `${id}.json`));
  
  // Recalculate project progress
  await recalculateProjectProgress(task.projectId);
}
