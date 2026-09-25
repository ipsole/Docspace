import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listPayments, createPayment } from '@/lib/services/billing';
import { listWorkspaceMembers, checkWorkspaceAccess } from '@/lib/services/workspace';

// Helper to check user membership
async function isUserMember(workspaceId: string, userId: string, role?: string): Promise<boolean> {
  return checkWorkspaceAccess(workspaceId, { id: userId, role });
}

// GET: Retrieve all payments in a workspace
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

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payments = await listPayments(workspaceId);
    return NextResponse.json(payments);
  } catch (error: any) {
    console.error('Payments GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new payment transaction
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, invoiceId, amount, paymentMethod, transactionRef, paymentDate, notes } = body;

    if (!workspaceId || !invoiceId || !amount || !paymentMethod || !paymentDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!(await isUserMember(workspaceId, user.id, user.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payment = await createPayment(workspaceId, {
      invoiceId,
      amount: Number(amount),
      paymentMethod,
      transactionRef: transactionRef || null,
      paymentDate,
      notes: notes || ''
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error: any) {
    console.error('Payments POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
