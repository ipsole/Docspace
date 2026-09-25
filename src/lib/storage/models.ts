// --- AUTH & USER ---
export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  avatar: string | null;
  status: 'online' | 'offline' | 'away';
  role: 'admin' | 'user';
  bio: string;
  disabled?: boolean;
}

export interface Session {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
  expiresAt: string;
}

// --- WORKSPACE ---
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export type TabAccessLevel = 'full' | 'view' | 'none';

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'manager' | 'admin' | 'team' | 'member' | 'client';
  joinedAt: string;
  allowedSections?: string[]; // list of sections they are allowed to access, e.g. ['chats', 'projects', 'docs']
  tabPermissions?: Record<string, TabAccessLevel>; // granular tab access, e.g. { chats: 'full', billing: 'none' }
}

// --- CLIENTS & CRM ---
export interface Client {
  id: string;
  workspaceId: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  industry: string;
  status: 'active' | 'inactive';
  notes: string;
  createdAt: string;
  avatarUrl?: string | null;
  clientLocation?: 'domestic' | 'international';
  clientType?: 'business' | 'individual';
  paymentSource?: 'foreign_remittance' | 'indian_bank';
  invoiceCurrency?: string;
  gstTreatmentOverride?: 'gst_applicable' | 'lut_export' | null;
  gstNumber?: string;
  placeOfSupply?: string;
  convertedFromLead?: boolean;
  profileCompleted?: boolean;
  tags?: string[];
}

export interface CRMLead {
  id: string;
  workspaceId: string;
  clientId?: string | null; // references Client if existing client
  leadType?: 'new_prospect' | 'existing_client';
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  title: string;
  value: number;
  currency: string;
  stage: 'lead' | 'contacted' | 'proposal_sent' | 'negotiation' | 'won' | 'lost' | 'retainer';
  notes: string;
  nextFollowUp: string | null;
  updatedAt: string;
  createdAt: string;
}

// --- PROJECTS & TASKS ---
export interface Project {
  id: string;
  workspaceId: string;
  clientId: string | null;
  businessType?: string | null;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';
  budget: number;
  progress: number; // percentage 0-100
  startDate: string | null;
  endDate: string | null;
  members: string[]; // user IDs
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  workspaceId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'review' | 'done';
  tags: string[];
  subtasks: { id: string; title: string; completed: boolean }[];
  dependencies: string[]; // task IDs
  timeSpentSec: number;
  createdAt: string;

  // Custom metadata fields
  money?: number | null;
  clientId?: string | null;
  comments?: { id: string; senderName: string; content: string; createdAt: string }[];
  attachments?: { id: string; name: string; url: string; size: number; mimeType: string }[];
}

// --- CHAT ---
export interface Conversation {
  id: string;
  workspaceId: string;
  name: string | null;
  isChannel: boolean; // channels are visible to all workspace members, direct chats are 1-on-1 DMs
  isGroup?: boolean;  // If true, it is a multi-user private group chat
  avatar?: string | null;
  description?: string | null;
  creatorId?: string | null;
  participants: string[];
  pinnedBy: string[];
  archivedBy: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage: MessageSummary | null;
  clientId?: string | null;
}

export interface MessageSummary {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  path?: string; // absolute or relative path under storage/uploads
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'attachment' | 'system';
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  attachments: MessageAttachment[];
  replyTo: string | null; // message ID
  reactions: { userId: string; emoji: string }[];
  pinned?: boolean;
}

// --- DOCUMENTS & WIKI ---
export interface Document {
  id: string;
  workspaceId: string;
  title: string;
  content: string; // Markdown or block structure JSON
  parentId: string | null; // For nesting documents and hierarchy
  clientId?: string | null;
  projectId?: string | null;
  isWiki: boolean; // Indicates if part of the workspace structured wiki
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

// --- BILLING & INVOICES ---
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number; // percentage, e.g. 18 for 18% GST
}

export interface Invoice {
  id: string;
  workspaceId: string;
  clientId: string;
  invoiceNumber: string;
  previousInvoiceNumber?: string;
  previousInvoiceNumbers?: string[];
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  issueDate: string;
  dueDate: string;
  items: InvoiceLineItem[];
  discount: number; // flat discount amount
  taxTotal: number;
  subtotal: number;
  total: number;
  currency: string;
  notes: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  workspaceId: string;
  amount: number;
  paymentMethod: string;
  transactionRef: string | null;
  paymentDate: string;
  notes: string;
}

// --- CONFIG & SYSTEM ---
export interface Settings {
  serverName: string;
  allowRegistration: boolean;
  maxUploadSizeMb: number;
  allowedMimeTypes: string[];
}
