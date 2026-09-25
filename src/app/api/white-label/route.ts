import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listWorkspaceMembers } from '@/lib/services/workspace';
import { safeReadFile, safeWriteFile, STORAGE_ROOT } from '@/lib/storage/storage';
import { logInfo } from '@/lib/storage/logger';
import path from 'path';

export interface PartnerHandoverClient {
  clientId: string;
  clientName: string;
  sharePercent: number; // e.g. 25 (%)
  projectPrice?: string; // e.g. "$2,500 / Project" or "$600/mo Retainer"
  scope?: string; // e.g. "Full branding & portal handover"
}

export interface WhiteLabelPartner {
  id: string;
  name: string;
  columnId: string;
  customDomain: string;
  logo?: string;
  color?: string;
  partnershipStatement?: string;
  handoverClients: PartnerHandoverClient[];
  status: 'active' | 'onboarding' | 'in_review' | 'paused';
  contactPerson: string;
  contactEmail: string;
  contractStartDate?: string;
  notes?: string;
  createdAt: string;

  // Legacy fields preserved for backward compatibility
  pricingModel?: string;
  docdrilSharePercent?: number;
  commissionNotes?: string;
  monthlyRevenue?: number;
  managedClientsCount?: number;
}

export interface WhiteLabelColumn {
  id: string;
  title: string;
  description?: string;
  badgeColor?: string;
  order: number;
}

export interface WhiteLabelPortalConfig {
  brandName: string;
  subdomain: string;
  customDomain: string;
  dnsStatus: 'verified' | 'pending' | 'unconfigured';
  primaryColor: string;
  removeWatermark: boolean;
  supportEmail: string;
  privacyUrl: string;
  termsUrl: string;
  senderName: string;
  senderEmail: string;
  loginHeadline: string;
  loginTagline: string;
}

export interface WhiteLabelData {
  columns: WhiteLabelColumn[];
  partners: WhiteLabelPartner[];
  portalConfig: WhiteLabelPortalConfig;
}

const DEFAULT_COLUMNS: WhiteLabelColumn[] = [
  {
    id: 'agency',
    title: 'Agency',
    description: 'Marketing, creative & web design agencies reselling Docdril white-label portals',
    badgeColor: 'indigo',
    order: 0
  },
  {
    id: 'partner',
    title: 'Partner',
    description: 'Strategic partners, resellers & software ecosystem affiliates',
    badgeColor: 'emerald',
    order: 1
  },
  {
    id: 'b2b',
    title: 'B2B',
    description: 'Direct corporate B2B enterprises & corporate client portals',
    badgeColor: 'purple',
    order: 2
  }
];

const DEFAULT_PARTNERS: WhiteLabelPartner[] = [
  {
    id: 'p-1',
    name: 'Apex Creative Agency',
    columnId: 'agency',
    customDomain: 'portal.apexagency.io',
    color: '#6366f1',
    partnershipStatement: 'Apex brings retainer & creative brand clients. Apex handles branding and client onboarding; Docdril receives 30% maintenance share for technical infrastructure and white-label client portals.',
    handoverClients: [
      {
        clientId: 'c-apex-1',
        clientName: 'Stun Ltd',
        sharePercent: 30,
        projectPrice: '$3,200 / mo',
        scope: 'Enterprise branding & client file portal'
      },
      {
        clientId: 'c-apex-2',
        clientName: 'Velocity Motors',
        sharePercent: 25,
        projectPrice: '$1,800 / project',
        scope: 'Product catalog & portal handoff'
      }
    ],
    status: 'active',
    contactPerson: 'Marcus Vance',
    contactEmail: 'marcus@apexagency.io',
    contractStartDate: '2025-08-15',
    createdAt: new Date().toISOString()
  },
  {
    id: 'p-2',
    name: 'Velocity Media Labs',
    columnId: 'agency',
    customDomain: 'app.velocitymedia.co',
    color: '#3b82f6',
    partnershipStatement: '25% reseller margin on all eCommerce client projects handed over to Docdril. Direct setup fee paid on client contract execution.',
    handoverClients: [
      {
        clientId: 'c-vel-1',
        clientName: 'NorthStar Retail',
        sharePercent: 25,
        projectPrice: '$2,500 / project',
        scope: 'Full store migration & white-label vault'
      }
    ],
    status: 'active',
    contactPerson: 'Elena Rostova',
    contactEmail: 'elena@velocitymedia.co',
    contractStartDate: '2025-10-01',
    createdAt: new Date().toISOString()
  },
  {
    id: 'p-3',
    name: 'Synergy Cloud Systems',
    columnId: 'partner',
    customDomain: 'workspace.synergycloud.net',
    color: '#10b981',
    partnershipStatement: 'Docdril retains 20% tier fee per sub-account handed over. Synergy delivers managed IT consulting and delegates all secure document access to Docdril.',
    handoverClients: [
      {
        clientId: 'c-syn-1',
        clientName: 'Aero Dynamics Corp',
        sharePercent: 20,
        projectPrice: '$4,200 / mo',
        scope: 'Managed IT storage & vendor file portal'
      }
    ],
    status: 'active',
    contactPerson: 'David Kim',
    contactEmail: 'dkim@synergycloud.net',
    contractStartDate: '2025-06-20',
    createdAt: new Date().toISOString()
  },
  {
    id: 'p-4',
    name: 'Fintech Alliance Hub',
    columnId: 'partner',
    customDomain: 'portal.fintechalliance.org',
    color: '#f59e0b',
    partnershipStatement: 'Strategic referral partnership. 35% commission paid to Docdril on member firm onboardings. Multi-tenant white-label security audits included.',
    handoverClients: [
      {
        clientId: 'c-fin-1',
        clientName: 'Horizon Capital',
        sharePercent: 35,
        projectPrice: '$3,750 / mo',
        scope: 'Portfolio deal room & client signoff'
      }
    ],
    status: 'onboarding',
    contactPerson: 'Alisha Patel',
    contactEmail: 'alisha@fintechalliance.org',
    contractStartDate: '2026-01-10',
    createdAt: new Date().toISOString()
  },
  {
    id: 'p-5',
    name: 'Nexa Industrial Group',
    columnId: 'b2b',
    customDomain: 'internal.nexagroup.com',
    color: '#8b5cf6',
    partnershipStatement: 'Direct enterprise B2B partner. Dedicated internal vendor portal for 400+ contractors. 100% direct SaaS contract with annual renewal.',
    handoverClients: [
      {
        clientId: 'c-nexa-1',
        clientName: 'Nexa Global Suppliers',
        sharePercent: 100,
        projectPrice: '$2,500 / mo',
        scope: 'Internal vendor document exchange'
      }
    ],
    status: 'active',
    contactPerson: 'Robert Chen',
    contactEmail: 'r.chen@nexagroup.com',
    contractStartDate: '2025-04-12',
    createdAt: new Date().toISOString()
  },
  {
    id: 'p-6',
    name: 'Quantum Health Network',
    columnId: 'b2b',
    customDomain: 'secure.quantumhealth.io',
    color: '#ec4899',
    partnershipStatement: 'Specialist medical group evaluating multi-clinic portal deployment with HIPAA/BAA compliance. Custom project scope under legal review.',
    handoverClients: [
      {
        clientId: 'c-qhn-1',
        clientName: 'Regional Clinics Alliance',
        sharePercent: 100,
        projectPrice: '$1,800 / mo',
        scope: 'Multi-clinic patient document portal'
      }
    ],
    status: 'in_review',
    contactPerson: 'Dr. Claire Hayes',
    contactEmail: 'claire@quantumhealth.io',
    contractStartDate: '2026-02-01',
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_CONFIG: WhiteLabelPortalConfig = {
  brandName: 'Apex Agency',
  subdomain: 'apex',
  customDomain: 'portal.apexagency.io',
  dnsStatus: 'verified',
  primaryColor: '#111827',
  removeWatermark: true,
  supportEmail: 'client-care@apexagency.io',
  privacyUrl: 'https://apexagency.io/privacy',
  termsUrl: 'https://apexagency.io/terms',
  senderName: 'Apex Agency Operations',
  senderEmail: 'portal@apexagency.io',
  loginHeadline: 'Client Collaboration Workspace',
  loginTagline: 'Secure access to your project milestones, documents, and live dossiers.'
};

const WORKSPACE_DIR = path.join(STORAGE_ROOT, 'workspaces');

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const members = await listWorkspaceMembers(workspaceId);
    const isMember = members.some(m => m.userId === user.id);
    if (!isMember && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const filePath = path.join(WORKSPACE_DIR, `${workspaceId}_whitelabel.json`);
    const content = await safeReadFile(filePath);

    if (!content) {
      const initialData: WhiteLabelData = {
        columns: DEFAULT_COLUMNS,
        partners: DEFAULT_PARTNERS,
        portalConfig: DEFAULT_CONFIG
      };
      await safeWriteFile(filePath, JSON.stringify(initialData, null, 2));
      return NextResponse.json(initialData);
    }

    const parsed = JSON.parse(content);
    const rawPartners = parsed.partners || DEFAULT_PARTNERS;
    const normalizedPartners = rawPartners.map((p: any) => {
      const defaultPartner = DEFAULT_PARTNERS.find(dp => dp.id === p.id);
      const handoverClients = (Array.isArray(p.handoverClients) && p.handoverClients.length > 0)
        ? p.handoverClients
        : (defaultPartner?.handoverClients || []);
      const partnershipStatement = p.partnershipStatement
        || defaultPartner?.partnershipStatement
        || p.commissionNotes
        || p.notes
        || '';

      return {
        ...p,
        handoverClients,
        partnershipStatement
      };
    });

    return NextResponse.json({
      columns: parsed.columns || DEFAULT_COLUMNS,
      partners: normalizedPartners,
      portalConfig: parsed.portalConfig || DEFAULT_CONFIG
    });
  } catch (error: any) {
    console.error('White-label GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, data } = body;

    if (!workspaceId || !data) {
      return NextResponse.json({ error: 'workspaceId and data are required' }, { status: 400 });
    }

    const members = await listWorkspaceMembers(workspaceId);
    const member = members.find(m => m.userId === user.id);
    if (!member && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const filePath = path.join(WORKSPACE_DIR, `${workspaceId}_whitelabel.json`);
    await safeWriteFile(filePath, JSON.stringify(data, null, 2));

    await logInfo('ADMIN', `White-label configuration updated by ${user.username}`, {
      workspaceId,
      partnerCount: data.partners?.length || 0,
      columnCount: data.columns?.length || 0
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('White-label POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
