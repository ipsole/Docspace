'use client';

import React, { useState } from 'react';
import {
  X,
  Printer,
  Download,
  Edit3,
  Trash2,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import {
  BusinessProfile,
  DEFAULT_BUSINESS_PROFILE,
  getDocTypeFromInvoice,
  buildInvoiceHTML,
  printInvoiceDocument,
  downloadInvoiceDocumentHtml,
} from '@/lib/invoice-renderer';

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface GenericInvoice {
  id: string;
  invoiceNumber: string;
  clientId?: string;
  clientName?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | string;
  issueDate: string;
  dueDate: string;
  total: number;
  subtotal?: number;
  taxTotal?: number;
  discount?: number;
  currency?: string;
  notes?: string;
  items?: InvoiceItem[];
}

interface InvoicePreviewModalProps {
  invoice: GenericInvoice | null;
  onClose: () => void;
  clientName?: string;
  businessProfile?: BusinessProfile;
  onEdit?: (invoice: GenericInvoice) => void;
  onDelete?: (id: string) => void;
  onUpdateStatus?: (id: string, status: any) => void;
  showFullLedgerLink?: boolean;
}

const STATUS_MAP: Record<string, { label: string; bgClass: string; textClass: string }> = {
  draft: { label: 'Draft', bgClass: 'bg-slate-100 dark:bg-slate-800', textClass: 'text-slate-600 dark:text-slate-400' },
  sent: { label: 'Sent', bgClass: 'bg-blue-50 dark:bg-blue-950/30', textClass: 'text-blue-600 dark:text-blue-400' },
  paid: { label: 'Paid', bgClass: 'bg-emerald-50 dark:bg-emerald-950/30', textClass: 'text-emerald-600 dark:text-emerald-400' },
  overdue: { label: 'Overdue', bgClass: 'bg-rose-50 dark:bg-rose-955/30', textClass: 'text-rose-600 dark:text-rose-400' },
  void: { label: 'Void', bgClass: 'bg-slate-100 dark:bg-slate-800', textClass: 'text-slate-400' }
};

export default function InvoicePreviewModal({
  invoice,
  onClose,
  clientName,
  businessProfile = DEFAULT_BUSINESS_PROFILE,
  onEdit,
  onDelete,
  onUpdateStatus,
  showFullLedgerLink = false,
}: InvoicePreviewModalProps) {
  const [previewTpl, setPreviewTpl] = useState<'classic' | 'modern' | 'compact'>('classic');
  const [copiedAi, setCopiedAi] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [mobileTab, setMobileTab] = useState<'preview' | 'details'>('preview');

  if (!invoice) return null;

  const resolvedInvoice: GenericInvoice = {
    ...invoice,
    clientName: invoice.clientName || clientName || 'Client'
  };

  const selDocType = getDocTypeFromInvoice(resolvedInvoice);
  const selDocTitle = selDocType === 'proforma' ? 'Proforma Invoice' : selDocType === 'receipt' ? 'Receipt' : 'Tax Invoice';
  const selDocNumLabel = selDocType === 'proforma' ? 'Proforma Number' : selDocType === 'receipt' ? 'Receipt Number' : 'Invoice Number';
  const statusMeta = STATUS_MAP[resolvedInvoice.status] || STATUS_MAP.draft;

  const generateInvoicePayload = () => {
    let meta: any = {};
    try {
      if (resolvedInvoice.notes && resolvedInvoice.notes.startsWith('{')) {
        meta = JSON.parse(resolvedInvoice.notes);
      }
    } catch {}

    const cleanBizName = (businessProfile.name || 'Docdril').replace(/[!.]+$/, '');
    const cleanBizEmail = (businessProfile.email || '').replace(/@docdril\.in$/i, '@docdril.com') || 'info@docdril.com';

    return {
      invoiceNumber: resolvedInvoice.invoiceNumber,
      documentType: selDocTitle,
      status: resolvedInvoice.status,
      issueDate: resolvedInvoice.issueDate,
      dueDate: resolvedInvoice.dueDate,
      currency: meta.invoiceCurrency || resolvedInvoice.currency || 'INR',
      issuedBy: {
        companyName: cleanBizName,
        tagline: businessProfile.tagline || 'Creative-tech studio',
        email: cleanBizEmail,
        phone: businessProfile.phone || '+91 6203526454',
        website: businessProfile.web || 'docdril.com',
        gstin: businessProfile.gstin || '',
        address: businessProfile.addr || '',
        bankDetails: businessProfile.bank || '',
        upiId: businessProfile.upiId || ''
      },
      billedTo: {
        clientName: meta.clientName || resolvedInvoice.clientName,
        email: meta.clientEmail || '',
        phone: meta.clientPhone || '',
        address: meta.clientAddress || '',
        gstin: meta.clientGst || '',
        placeOfSupply: meta.placeOfSupply || ''
      },
      items: (resolvedInvoice.items || []).map((item, idx) => ({
        index: idx + 1,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRatePct: item.taxRate ?? 18,
        amount: item.quantity * item.unitPrice
      })),
      financials: {
        subtotal: resolvedInvoice.subtotal ?? (resolvedInvoice.total - (resolvedInvoice.taxTotal || 0)),
        discount: resolvedInvoice.discount || 0,
        taxTotal: resolvedInvoice.taxTotal || 0,
        grandTotal: resolvedInvoice.total
      },
      notesAndTerms: {
        notes: meta.notesText || resolvedInvoice.notes || 'We appreciate the opportunity to work with you!',
        closingMessage: `Thank you for your business with ${cleanBizName}`
      }
    };
  };

  const handleCopyForAi = () => {
    const payload = generateInvoicePayload();
    const sym = payload.currency === 'USD' ? '$' : payload.currency === 'EUR' ? '€' : payload.currency === 'GBP' ? '£' : '₹';
    const itemsFormatted = (payload.items || [])
      .map(
        (it) =>
          `  - ${it.description}: Qty ${it.quantity} × ${sym}${it.unitPrice.toLocaleString()} = ${sym}${it.amount.toLocaleString()}`
      )
      .join('\n');

    const prompt = `Please generate a realistic, high-resolution, and professional image of a beautifully designed invoice using the following details.

Style & Visual Guidelines:
1. Format & Presentation: High-resolution full A4 vertical portrait document image, flat-lay / clean top-down presentation, sleek and ultra-modern aesthetic.
2. Design Style: Minimalist executive branding, crisp modern typography, elegant spacing, subtle indigo/slate accents on a pristine white background.
3. Visual Content to Display in the Image:
   - Header: "${payload.issuedBy.companyName}" branding, title "${payload.documentType}", Invoice #: "${payload.invoiceNumber}"
   - Dates: Issue Date: "${payload.issueDate}", Due Date: "${payload.dueDate}"
   - Issued By: ${payload.issuedBy.companyName} | Email: ${payload.issuedBy.email} | Phone: ${payload.issuedBy.phone} | Web: ${payload.issuedBy.website}
   - Billed To Client: ${payload.billedTo.clientName}${payload.billedTo.email ? ` (${payload.billedTo.email})` : ''}${payload.billedTo.address ? ` | ${payload.billedTo.address}` : ''}
   - Itemized Table:
${itemsFormatted}
   - Financial Totals:
     * Subtotal: ${sym}${payload.financials.subtotal.toLocaleString()}
     * Tax: ${sym}${payload.financials.taxTotal.toLocaleString()}
     * Grand Total: ${sym}${payload.financials.grandTotal.toLocaleString()}
   - Payment Details:
     * Bank: ${payload.issuedBy.bankDetails || 'Bank transfer details'}
     * UPI ID: ${payload.issuedBy.upiId || 'docdril@upi'}
   - Footer:
     * "${payload.notesAndTerms.closingMessage}"
     * Contact: ${payload.issuedBy.email}

Please generate an attractive, high-quality visual image depicting this invoice in the most beautiful manner.

Structured Data Reference:
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopiedAi(true);
    setTimeout(() => setCopiedAi(false), 2500);
  };

  const handleCopyRawJson = () => {
    const payload = generateInvoicePayload();
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl h-[95vh] sm:h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Preview Modal Header */}
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{selDocTitle}</span>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 ${statusMeta.bgClass} ${statusMeta.textClass}`}>
              {resolvedInvoice.status}
            </span>
            <span className="hidden sm:inline text-[10px] text-slate-400">Issued: {resolvedInvoice.issueDate}</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Copy for ChatGPT (Image) */}
            <button
              type="button"
              onClick={handleCopyForAi}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer ${
                copiedAi
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-indigo-500/20'
              }`}
              title="Copies prompt for ChatGPT to generate a high-resolution visual image of this invoice"
            >
              {copiedAi ? (
                <>
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Copied Prompt!</span>
                  <span className="sm:hidden">Copied!</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                  <span className="hidden sm:inline">Copy for ChatGPT</span>
                  <span className="sm:hidden">AI Prompt</span>
                </>
              )}
            </button>

            {/* Copy Raw JSON */}
            <button
              type="button"
              onClick={handleCopyRawJson}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 border rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                copiedJson
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
              title="Copies raw invoice JSON data to clipboard"
            >
              {copiedJson ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">Copied JSON!</span>
                  <span className="sm:hidden">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Copy Raw JSON</span>
                  <span className="sm:hidden">JSON</span>
                </>
              )}
            </button>

            {/* HTML download */}
            <button
              type="button"
              onClick={() => downloadInvoiceDocumentHtml(resolvedInvoice, previewTpl, businessProfile)}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
              title="Download static HTML file"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download HTML</span>
              <span className="sm:hidden">HTML</span>
            </button>

            {/* Delete Invoice */}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(resolvedInvoice.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-955/20 rounded-xl transition-all cursor-pointer"
                title={`Delete ${selDocTitle}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            {/* Open in full ledger (only if onEdit is not provided) */}
            {showFullLedgerLink && !onEdit && (
              <a
                href={`/invoices`}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 transition-all cursor-pointer"
                title="Open in Ledger Page"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in Invoices
              </a>
            )}

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              title="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile View Switcher Tab Bar */}
        <div className="flex md:hidden px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          <div className="flex bg-slate-200/80 dark:bg-slate-900 p-0.5 rounded-xl w-full text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setMobileTab('preview')}
              className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mobileTab === 'preview'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>📄 Document Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('details')}
              className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mobileTab === 'details'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>⚙️ Details & Actions</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* Left Column: Properties Dossier */}
          <div className={`${mobileTab === 'preview' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[18rem] p-4 sm:p-5 border-r border-slate-100 dark:border-slate-800 space-y-4 overflow-y-auto shrink-0 bg-slate-50/30 dark:bg-slate-950/10`}>
            <div className="space-y-1">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{selDocNumLabel}</p>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{resolvedInvoice.invoiceNumber}</p>
            </div>

            <div className="space-y-1">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Client Account</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{resolvedInvoice.clientName}</p>
            </div>

            {/* Status Switcher Select */}
            {onUpdateStatus && (
              <div className="space-y-1.5">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Change Status</p>
                <select
                  value={resolvedInvoice.status}
                  onChange={e => onUpdateStatus(resolvedInvoice.id, e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none cursor-pointer"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="void">Void</option>
                </select>
              </div>
            )}

            {/* Template Style Selector */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Preview Template Style</p>
              <div className="flex flex-col gap-1.5">
                {(['classic', 'modern', 'compact'] as const).map(style => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setPreviewTpl(style)}
                    className={`py-2 px-3 border rounded-xl text-[10px] font-black uppercase tracking-wider text-left transition-all cursor-pointer ${
                      previewTpl === style
                        ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {style} Template
                  </button>
                ))}
              </div>
            </div>

            {/* Financial Details */}
            <div className="p-3 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-500 text-[11px]">
                <span>Issue Date</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{resolvedInvoice.issueDate}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 text-[11px]">
                <span>{selDocType === 'receipt' ? 'Payment Date' : selDocType === 'proforma' ? 'Valid Till' : 'Due Date'}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{resolvedInvoice.dueDate}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>{selDocType === 'receipt' ? 'Total Received' : 'Grand Total'}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">₹{resolvedInvoice.total.toLocaleString()}</span>
              </div>
            </div>

            {/* Invoice Actions */}
            <div className="space-y-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Invoice Actions</p>
              
              {/* Print PDF Button */}
              <button
                type="button"
                onClick={() => printInvoiceDocument(resolvedInvoice, previewTpl, businessProfile)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                title="Print / Save PDF"
              >
                <Printer className="h-4 w-4 shrink-0" />
                <span>Print PDF</span>
              </button>

              {/* Edit Invoice */}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(resolvedInvoice)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-955/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                  title={`Edit ${selDocTitle}`}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Invoice</span>
                </button>
              )}
            </div>

            {/* Return to preview button for mobile */}
            <button
              type="button"
              onClick={() => setMobileTab('preview')}
              className="md:hidden w-full py-2 px-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 mt-2"
            >
              <span>← View Document Preview</span>
            </button>

          </div>

          {/* Right Column: Live rendered Document Preview (iframe) */}
          <div className={`${mobileTab === 'details' ? 'hidden md:flex' : 'flex'} flex-1 bg-slate-100 dark:bg-slate-950/40 p-2 sm:p-4 flex-col items-center justify-center min-h-0 relative overflow-hidden`}>
            
            {/* Quick Template Switcher pills on top of preview */}
            <div className="w-full max-w-[680px] mb-2 flex items-center justify-between gap-2 px-1 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Template:</span>
              <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-[10px] font-bold shadow-2xs">
                {(['classic', 'modern', 'compact'] as const).map(style => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setPreviewTpl(style)}
                    className={`px-3 py-1 rounded-lg capitalize transition-all cursor-pointer ${
                      previewTpl === style
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs font-black'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Iframe preview box */}
            <div className="w-full max-w-[680px] flex-1 bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md overflow-hidden flex flex-col min-h-0">
              <iframe
                title="Invoice Document Preview"
                className="flex-1 w-full border-none"
                srcDoc={buildInvoiceHTML(resolvedInvoice, previewTpl, false, businessProfile)}
              />
            </div>

            {/* Mobile Bottom Quick Actions Bar */}
            <div className="md:hidden w-full max-w-[680px] pt-2 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => printInvoiceDocument(resolvedInvoice, previewTpl, businessProfile)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-900 hover:opacity-90 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 shrink-0" />
                <span>Print PDF</span>
              </button>

              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(resolvedInvoice)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-955/20 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-2xs"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => downloadInvoiceDocumentHtml(resolvedInvoice, previewTpl, businessProfile)}
                className="p-2.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer shadow-2xs"
                title="Download HTML"
              >
                <Download className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('details')}
                className="py-2.5 px-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer shadow-2xs text-xs font-bold flex items-center gap-1"
                title="View details & settings"
              >
                <span>Details</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
