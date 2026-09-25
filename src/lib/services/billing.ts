import fs from 'fs/promises';
import path from 'path';
import { Invoice, Payment, InvoiceLineItem } from '../storage/models';
import { safeReadFile, safeWriteFile, safeDeleteFile, STORAGE_ROOT } from '../storage/storage';
import { isFirestoreEnabled, firestoreList, firestoreGet } from '../storage/firestoreAdapter';
import { v4 as uuidv4 } from 'uuid';

const INVOICES_DIR = path.join(STORAGE_ROOT, 'invoices');
const PAYMENTS_DIR = path.join(STORAGE_ROOT, 'payments');

// Ensure directories exist safely without throwing on read-only environments
async function ensureDirs() {
  if (process.env.VERCEL || isFirestoreEnabled()) return;
  try {
    await fs.mkdir(INVOICES_DIR, { recursive: true });
    await fs.mkdir(PAYMENTS_DIR, { recursive: true });
  } catch (err: any) {
    if (err?.code !== 'EROFS') throw err;
  }
}

// Compute totals for line items
export function calculateInvoiceTotals(
  items: InvoiceLineItem[],
  discount: number = 0
): { subtotal: number; taxTotal: number; total: number } {
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const lineSubtotal = item.quantity * item.unitPrice;
    const lineTax = lineSubtotal * (item.taxRate / 100);
    subtotal += lineSubtotal;
    taxTotal += lineTax;
  }

  const total = Math.max(0, subtotal + taxTotal - discount);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

// --- INVOICE OPERATIONS ---

export async function listInvoices(workspaceId: string): Promise<Invoice[]> {
  if (isFirestoreEnabled()) {
    const invoices = await firestoreList<Invoice>('invoices');
    return invoices
      .filter(inv => inv && inv.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
  }

  await ensureDirs();
  const files = await fs.readdir(INVOICES_DIR).catch(() => []);
  const invoices: Invoice[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await safeReadFile(path.join(INVOICES_DIR, file));
      if (content) {
        try {
          const inv = JSON.parse(content) as Invoice;
          if (inv.workspaceId === workspaceId) {
            invoices.push(inv);
          }
        } catch {}
      }
    }
  }

  return invoices.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  if (isFirestoreEnabled()) {
    const inv = await firestoreGet<Invoice>('invoices', id);
    if (inv) return inv;
  }
  await ensureDirs();
  const content = await safeReadFile(path.join(INVOICES_DIR, `${id}.json`));
  if (!content) return null;
  return JSON.parse(content) as Invoice;
}

export async function createInvoice(
  workspaceId: string,
  data: Omit<Invoice, 'id' | 'workspaceId' | 'createdAt' | 'subtotal' | 'taxTotal' | 'total'>
): Promise<Invoice> {
  await ensureDirs();
  const id = uuidv4();
  
  const { subtotal, taxTotal, total } = calculateInvoiceTotals(data.items, data.discount);

  const invoice: Invoice = {
    id,
    workspaceId,
    ...data,
    subtotal,
    taxTotal,
    total,
    createdAt: new Date().toISOString()
  };

  await safeWriteFile(path.join(INVOICES_DIR, `${id}.json`), JSON.stringify(invoice, null, 2));
  return invoice;
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice> {
  const invoice = await getInvoice(id);
  if (!invoice) throw new Error('Invoice not found');

  const updatedData = {
    ...invoice,
    ...updates
  };

  // Recalculate totals if items or discounts changed
  if (updates.items !== undefined || updates.discount !== undefined) {
    const { subtotal, taxTotal, total } = calculateInvoiceTotals(updatedData.items, updatedData.discount);
    updatedData.subtotal = subtotal;
    updatedData.taxTotal = taxTotal;
    updatedData.total = total;
  }

  await safeWriteFile(path.join(INVOICES_DIR, `${id}.json`), JSON.stringify(updatedData, null, 2));
  return updatedData;
}

export async function deleteInvoice(id: string): Promise<void> {
  await safeDeleteFile(path.join(INVOICES_DIR, `${id}.json`));
  
  // Clean up any payments linked to this invoice
  const files = await fs.readdir(PAYMENTS_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(PAYMENTS_DIR, file);
      const content = await safeReadFile(filePath);
      if (content) {
        try {
          const payment = JSON.parse(content) as Payment;
          if (payment.invoiceId === id) {
            await safeDeleteFile(filePath);
          }
        } catch {}
      }
    }
  }
}

// --- PAYMENT OPERATIONS ---

export async function listPayments(workspaceId: string): Promise<Payment[]> {
  if (isFirestoreEnabled()) {
    const payments = await firestoreList<Payment>('payments');
    return payments
      .filter(p => p && p.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  }

  await ensureDirs();
  const files = await fs.readdir(PAYMENTS_DIR).catch(() => []);
  const payments: Payment[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await safeReadFile(path.join(PAYMENTS_DIR, file));
      if (content) {
        try {
          const pay = JSON.parse(content) as Payment;
          if (pay.workspaceId === workspaceId) {
            payments.push(pay);
          }
        } catch {}
      }
    }
  }

  return payments.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
}

export async function createPayment(
  workspaceId: string,
  data: Omit<Payment, 'id' | 'workspaceId'>
): Promise<Payment> {
  await ensureDirs();
  const id = uuidv4();

  const payment: Payment = {
    id,
    workspaceId,
    ...data
  };

  await safeWriteFile(path.join(PAYMENTS_DIR, `${id}.json`), JSON.stringify(payment, null, 2));

  // Auto-mark invoice as paid if payment amount covers balance (or update invoice status to paid)
  const invoice = await getInvoice(data.invoiceId);
  if (invoice) {
    // List all payments for this invoice
    const allPayments = await listPayments(workspaceId);
    const invoicePayments = allPayments.filter(p => p.invoiceId === invoice.id);
    const totalPaid = invoicePayments.reduce((sum, p) => sum + p.amount, 0) + data.amount;
    
    if (totalPaid >= invoice.total) {
      await updateInvoice(invoice.id, { status: 'paid' });
    } else {
      await updateInvoice(invoice.id, { status: 'sent' }); // remains sent/partial
    }
  }

  return payment;
}
