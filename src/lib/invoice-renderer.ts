export interface BusinessProfile {
  name: string;
  tagline?: string;
  gstin: string;
  addr: string;
  phone: string;
  email: string;
  web: string;
  bank: string;
  upiId: string;
  lutNumber: string;
  qrCode: string;
  logo: string;
}

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  name: 'Docdril',
  tagline: 'Creative-tech studio',
  gstin: '10CKTPC0886R1ZL',
  addr: 'Ward No. 21, Station Road, Samastipur, 848101',
  phone: '+91 6203526454',
  email: 'info@docdril.com',
  web: 'docdril.com',
  bank: 'Bank Name: Kotak Mahindra\nIFSC: KKBK0008057\nA/c Number: 2645691612\nUPI ID: 7304631447@okbizaxis',
  upiId: '7304631447@okbizaxis',
  lutNumber: '',
  qrCode: '',
  logo: '/logo.png',
};

export const getDocTypeFromInvoice = (inv: { invoiceNumber?: string; notes?: string }): 'invoice' | 'proforma' | 'receipt' => {
  const num = (inv.invoiceNumber || '').trim().toUpperCase();
  if (num.startsWith('PRO-') || num.startsWith('PROFORMA')) return 'proforma';
  if (num.startsWith('REC-') || num.startsWith('RECEIPT')) return 'receipt';
  if (num.startsWith('DOC-')) return 'invoice';
  let m: any = {};
  try {
    if (inv.notes && inv.notes.startsWith('{')) m = JSON.parse(inv.notes);
  } catch {}
  if (m.docType === 'proforma' || m.docType === 'receipt') return m.docType;
  return 'invoice';
};

export function buildInvoiceHTML(
  inv: any,
  style: 'classic' | 'modern' | 'compact' = 'classic',
  forPrint = false,
  businessProfile: BusinessProfile = DEFAULT_BUSINESS_PROFILE
) {
  let meta = {
    template: 'classic',
    docType: 'invoice',
    placeOfSupply: '',
    gstRate: 18,
    gstType: 'igst',
    advancePct: 20,
    requireAdvance: true,
    notesText: 'We appreciate the opportunity to work with you!',
    clientGst: '',
    clientPhone: '',
    clientEmail: '',
    clientAddress: '',
    clientName: inv.clientName || '',
    gstTreatment: 'gst_applicable',
    invoiceCurrency: 'INR'
  };

  try {
    if (inv.notes && inv.notes.startsWith('{')) {
      meta = { ...meta, ...JSON.parse(inv.notes) };
    } else {
      meta.notesText = inv.notes || '';
    }
  } catch {}

  const numUpper = (inv.invoiceNumber || '').trim().toUpperCase();
  let resolvedDocType: 'invoice' | 'proforma' | 'receipt' = 'invoice';
  if (numUpper.startsWith('PRO-') || numUpper.startsWith('PROFORMA')) {
    resolvedDocType = 'proforma';
  } else if (numUpper.startsWith('REC-') || numUpper.startsWith('RECEIPT')) {
    resolvedDocType = 'receipt';
  } else if (numUpper.startsWith('DOC-')) {
    resolvedDocType = 'invoice';
  } else if (meta.docType === 'proforma' || meta.docType === 'receipt') {
    resolvedDocType = meta.docType;
  }

  const isProforma = resolvedDocType === 'proforma';
  const isReceipt = resolvedDocType === 'receipt';
  const docTitle = isProforma ? 'Proforma Invoice' : isReceipt ? 'Receipt' : 'Tax Invoice';
  const docNumLabel = isProforma ? 'Proforma No.' : isReceipt ? 'Receipt No.' : 'Invoice No.';
  const dateLabel = isReceipt ? 'Receipt Date:' : 'Date:';
  const dueDateLabel = isReceipt ? 'Payment Date:' : isProforma ? 'Valid Till:' : 'Due Date:';
  const sub = inv.subtotal || inv.total;
  const flatDiscount = inv.discount || 0;
  const gAmt = inv.taxTotal || 0;
  const total = inv.total;
  const advAmt = total * (meta.advancePct / 100);
  const f2 = (n: number) => n.toFixed(2);

  const isModern = style === 'modern';
  const isCompact = style === 'compact';

  const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  const cellPadding = isCompact ? '4px 6px' : '8px 10px';
  const itemFontSize = isCompact ? '10px' : '11.5px';

  const itemsRows = (inv.items || []).map((it: any, i: number) => `
    <tr style="border-bottom:1px solid ${isCompact ? '#f1f5f9' : '#e2e8f0'}">
      <td style="padding:${cellPadding}; color:#000000; vertical-align:top; font-size:${itemFontSize}">${i+1}</td>
      <td style="padding:${cellPadding}; color:#000000; font-weight:600; vertical-align:top; font-size:${itemFontSize}">${it.description || '—'}</td>
      <td style="padding:${cellPadding}; text-align:center; color:#000000; vertical-align:top; font-size:${itemFontSize}">${it.quantity}</td>
      <td style="padding:${cellPadding}; text-align:right; color:#000000; vertical-align:top; font-size:${itemFontSize}">₹${f2(it.unitPrice)}</td>
      <td style="padding:${cellPadding}; text-align:right; font-weight:700; color:#000000; vertical-align:top; font-size:${itemFontSize}">₹${f2(it.quantity * it.unitPrice)}</td>
    </tr>
  `).join('');

  const discountRow = flatDiscount > 0 ? `
    <tr>
      <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">Discount</td>
      <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">-₹${f2(flatDiscount)}</td>
    </tr>
  ` : '';

  const gstRows = (gAmt > 0 && meta.gstTreatment !== 'lut_export') ? (
    meta.gstType === 'igst' ? `
      <tr>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">IGST @${meta.gstRate}%</td>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">₹${f2(gAmt)}</td>
      </tr>
    ` : `
      <tr>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">CGST @${meta.gstRate/2}%</td>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">₹${f2(gAmt/2)}</td>
      </tr>
      <tr>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">SGST @${meta.gstRate/2}%</td>
        <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:700; color:#000000">₹${f2(gAmt/2)}</td>
      </tr>
    `
  ) : '';

  const showAdvance = !isReceipt && meta.requireAdvance !== false && meta.advancePct > 0;
  const advBox = isReceipt ? `
    <div style="margin-top:${isCompact ? '6px' : '12px'}; margin-bottom:${isCompact ? '2px' : '4px'}; font-size:${isCompact ? '9.5px' : '11px'}; color:#000000">
      <b>Payment Status:</b> Payment acknowledged and received in full with thanks.
    </div>
  ` : showAdvance ? `
    <div style="margin-top:${isCompact ? '6px' : '12px'}; margin-bottom:${isCompact ? '2px' : '4px'}; font-size:${isCompact ? '9.5px' : '11px'}; color:#000000">
      <b>${isProforma ? 'Advance Terms' : 'Payment Terms'}:</b> ${meta.advancePct}% advance payment (<b>₹${f2(advAmt)}</b>) ${isProforma ? 'required upon order confirmation.' : 'required to initiate the project stages.'}
    </div>
  ` : '';

  const hdrBg = isModern
    ? 'background:#000000; color:#ffffff; padding:18px 22px; border-radius:10px; margin-bottom:18px;'
    : isCompact
    ? 'border-bottom:1.5px solid #000000; padding-bottom:8px; margin-bottom:10px;'
    : 'border-bottom:2px solid #000000; padding-bottom:16px; margin-bottom:18px;';

  const subCol = isModern ? '#ffffff' : '#000000';
  const titleCol = isModern ? '#ffffff' : '#000000';

  const logoSrc = businessProfile.logo || '/logo.png';
  const logoBlock = logoSrc ? `
    <div style="margin-bottom:${isCompact ? '5px' : '10px'}">
      <img src="${logoSrc}" style="height:${isCompact ? '42px' : '58px'}; width:${isCompact ? '42px' : '58px'}; object-fit:contain; display:block; border-radius:8px; ${isModern ? 'background:#ffffff; padding:3px;' : ''}" alt="Logo" />
    </div>
  ` : '';

  const headerBlock = `
    <div class="inv-header" style="${hdrBg} display:flex; justify-content:space-between; align-items:flex-start">
      <div class="inv-header-left" style="max-width:55%">
        ${logoBlock}
        <div style="font-size:${isCompact ? '18px' : '22px'}; font-weight:900; letter-spacing:-0.5px; color:${titleCol}; line-height:1.2">${businessProfile.name || 'Docdril'}</div>
        ${businessProfile.tagline ? `<div style="font-size:${isCompact ? '10px' : '11px'}; font-weight:600; color:${subCol}; margin-top:${isCompact ? '2px' : '3px'}; letter-spacing:0.02em">${businessProfile.tagline}</div>` : ''}
        <div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:${subCol}; margin-top:${isCompact ? '2px' : '3px'}">${businessProfile.web || 'docdril.com'}${businessProfile.email ? ` &nbsp;•&nbsp; ${businessProfile.email}` : ''}</div>
        ${businessProfile.gstin ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; font-weight:700; color:${titleCol}; margin-top:3px"><b>GSTIN:</b> ${businessProfile.gstin}</div>` : ''}
      </div>
      <div class="inv-header-right" style="text-align:right">
        <div style="font-size:${isCompact ? '14px' : '16px'}; font-weight:900; text-transform:uppercase; color:${titleCol}; letter-spacing:0.06em">${docTitle}</div>
        <div style="font-size:${isCompact ? '10px' : '11px'}; color:${subCol}; margin-top:${isCompact ? '3px' : '6px'}"><b style="color:${titleCol}">${docNumLabel}</b> ${inv.invoiceNumber}</div>
        <div style="font-size:${isCompact ? '10px' : '11px'}; color:${subCol}; margin-top:2px"><b style="color:${titleCol}">${dateLabel}</b> ${inv.issueDate}</div>
        ${inv.dueDate ? `<div style="font-size:${isCompact ? '10px' : '11px'}; color:${subCol}; margin-top:2px"><b style="color:${titleCol}">${dueDateLabel}</b> ${inv.dueDate}</div>` : ''}
      </div>
    </div>
  `;

  const partiesBlock = `
    <table class="inv-parties" style="width:100%; border-collapse:collapse; margin-bottom:${isCompact ? '10px' : '20px'}">
      <tr>
        <td class="inv-party-billed" style="width:50%; vertical-align:top; padding-right:15px">
          <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '2px' : '5px'}">${isReceipt ? 'Received From' : 'Billed To'}</div>
          <div style="font-size:${isCompact ? '12px' : '13.5px'}; font-weight:800; color:#000000; margin-bottom:2px">${meta.clientName || inv.clientName}</div>
          ${meta.clientGst ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; margin-bottom:2px"><b>GSTIN:</b> ${meta.clientGst}</div>` : ''}
          ${meta.clientAddress ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; line-height:1.35; margin-bottom:2px">${meta.clientAddress}</div>` : ''}
          ${meta.clientPhone ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Phone: ${meta.clientPhone}</div>` : ''}
          ${meta.clientEmail ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Email: ${meta.clientEmail}</div>` : ''}
        </td>
        <td class="inv-party-issued" style="width:50%; vertical-align:top; padding-left:15px">
          <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '2px' : '5px'}">Issued By</div>
          <div style="font-size:${isCompact ? '12px' : '13.5px'}; font-weight:800; color:#000000; margin-bottom:2px">${businessProfile.name || 'Docdril'}</div>
          ${businessProfile.gstin ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; margin-bottom:2px"><b>GSTIN:</b> ${businessProfile.gstin}</div>` : ''}
          <div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; line-height:1.35; margin-bottom:2px">${businessProfile.addr}</div>
          <div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Phone: ${businessProfile.phone}</div>
          ${businessProfile.email ? `<div style="font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000">Email: ${businessProfile.email.replace(/@docdril\.in$/i, '@docdril.com')}</div>` : ''}
          ${meta.placeOfSupply ? `<div style="margin-top:3px; font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000"><b>Place of Supply:</b> ${meta.placeOfSupply}</div>` : ''}
        </td>
      </tr>
    </table>
  `;

  const tableHeaderBg = isModern ? '#f1f5f9' : '#ffffff';
  const totalBorderBottom = '2px solid #000000';
  const totalRowLabel = isReceipt ? 'Total Received' : isProforma ? 'Estimated Total' : 'Total Payable';

  const tableBlock = `
    <div class="inv-table-wrap" style="width:100%">
      <table class="inv-items-table" style="width:100%; border-collapse:collapse; margin-bottom:${isCompact ? '8px' : '12px'}; font-size:${itemFontSize}">
        <thead>
          <tr style="background:${tableHeaderBg}; color:#000000; font-size:${isCompact ? '9px' : '10px'}; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; border-top:1.5px solid #000000; border-bottom:1.5px solid #000000">
            <th style="padding:${cellPadding}; text-align:left; width:6%">#</th>
            <th style="padding:${cellPadding}; text-align:left; width:48%">Description</th>
            <th style="padding:${cellPadding}; text-align:center; width:12%">Qty</th>
            <th style="padding:${cellPadding}; text-align:right; width:17%">Price</th>
            <th style="padding:${cellPadding}; text-align:right; width:17%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    </div>

    <div class="inv-total-wrap" style="display:flex; justify-content:flex-end; margin-bottom:${isCompact ? '8px' : '14px'}">
      <table style="width:${isCompact ? '230px' : '280px'}; border-collapse:collapse; font-size:${isCompact ? '10px' : '11.5px'}">
        <tr>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; color:#000000">Subtotal</td>
          <td style="padding:${isCompact ? '2px 6px' : '4px 8px'}; text-align:right; font-weight:600; color:#000000">₹${f2(sub)}</td>
        </tr>
        ${discountRow}
        ${gstRows}
        <tr style="border-top:2px solid #000000; border-bottom:${totalBorderBottom}">
          <td style="padding:${isCompact ? '4px 6px' : '8px 8px'}; font-size:${isCompact ? '11px' : '13px'}; font-weight:900; color:#000000; text-transform:uppercase">${totalRowLabel}</td>
          <td style="padding:${isCompact ? '4px 6px' : '8px 8px'}; text-align:right; font-size:${isCompact ? '12px' : '14px'}; font-weight:900; color:#000000">₹${f2(total)}</td>
        </tr>
      </table>
    </div>
  `;

  const qrSize = isCompact ? 95 : 135;
  const qrImageBlock = businessProfile.qrCode ? `
    <div style="background:#ffffff; padding:${isCompact ? '5px' : '7px'}; border:1px solid #d1d5db; border-radius:6px; display:inline-block; line-height:0; margin-bottom:${isCompact ? '4px' : '8px'}">
      <img src="${businessProfile.qrCode}" style="width:${qrSize}px; height:${qrSize}px; object-fit:contain; image-rendering:-webkit-optimize-contrast; image-rendering:crisp-edges; display:block" alt="UPI QR Code" />
    </div>
  ` : '';

  const paymentBlock = isReceipt ? `
    <div style="border-top:${isCompact ? '1px' : '1.5px'} solid #000000; margin-top:${isCompact ? '10px' : '20px'}; padding-top:${isCompact ? '8px' : '14px'}">
      <table class="inv-payment-table" style="width:100%; border-collapse:collapse">
        <tr>
          <td class="inv-pay-info" style="vertical-align:top; width:56%; padding-right:16px">
            <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '3px' : '6px'}">Payment Confirmation</div>
            <div style="font-size:${isCompact ? '9.5px' : '11px'}; line-height:${isCompact ? '1.4' : '1.6'}; color:#000000">
              Payment received and credited to bank account.<br>
              Thank you for your prompt settlement.
            </div>
          </td>
          <td class="inv-pay-extra" style="vertical-align:top; text-align:right; width:44%">
            <div style="display:inline-block; border:1.5px solid #000000; border-radius:8px; padding:${isCompact ? '6px 12px' : '8px 16px'}; text-align:center">
              <div style="font-size:${isCompact ? '8px' : '9px'}; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#000000">Official Receipt</div>
              <div style="font-size:${isCompact ? '12px' : '14px'}; font-weight:900; color:#000000; margin-top:2px">PAID IN FULL</div>
            </div>
          </td>
        </tr>
      </table>
    </div>
  ` : `
    <div style="border-top:${isCompact ? '1px' : '1.5px'} solid #000000; margin-top:${isCompact ? '10px' : '20px'}; padding-top:${isCompact ? '8px' : '14px'}">
      <table class="inv-payment-table" style="width:100%; border-collapse:collapse">
        <tr>
          <td class="inv-pay-info" style="vertical-align:top; width:54%; padding-right:16px">
            <div style="font-size:${isCompact ? '8.5px' : '9.5px'}; font-weight:800; text-transform:uppercase; color:#000000; letter-spacing:0.06em; margin-bottom:${isCompact ? '3px' : '6px'}">Bank Transfer Details</div>
            <div style="font-size:${isCompact ? '9.5px' : '11px'}; line-height:${isCompact ? '1.4' : '1.6'}; color:#000000">${businessProfile.bank ? businessProfile.bank.replace(/\n/g, '<br>') : ''}</div>
          </td>
          <td class="inv-pay-extra" style="vertical-align:top; text-align:right; width:46%">
            <div class="qr-col" style="display:inline-flex; flex-direction:column; align-items:flex-end; text-align:right">
              ${qrImageBlock}
              <div style="font-size:${isCompact ? '8px' : '9px'}; color:#000000; margin-bottom:2px; text-transform:uppercase; font-weight:800; letter-spacing:0.04em">UPI ID (Scan & Pay)</div>
              <div style="font-weight:900; font-size:${isCompact ? '11px' : '12.5px'}; color:#000000; font-family:monospace">${businessProfile.upiId || ''}</div>
              <div style="font-size:${isCompact ? '8px' : '9px'}; color:#000000; margin-top:2px">Pay via GPAY, PhonePe, or Paytm</div>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;

  const notesBlock = meta.notesText ? `
    <div style="margin-top:${isCompact ? '6px' : '14px'}; font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; line-height:1.4">
      <b>Note:</b> <i>${meta.notesText}</i>
    </div>
  ` : '';

  const isLut = meta.gstTreatment === 'lut_export';
  const lutNumberText = businessProfile.lutNumber ? ` (LUT Ref No: ${businessProfile.lutNumber})` : '';
  const lutWarningBlock = isLut ? `
    <div style="margin-top:${isCompact ? '6px' : '10px'}; font-size:${isCompact ? '9.5px' : '10.5px'}; color:#000000; font-weight:700">
      Supply meant for Export under LUT without payment of IGST.${lutNumberText}
    </div>
  ` : '';

  const rawBizEmail = businessProfile.email || '';
  const bizEmail = rawBizEmail.replace(/@docdril\.in$/i, '@docdril.com') || 'info@docdril.com';
  const rawBizName = businessProfile.name || 'Docdril';
  const bizName = rawBizName.replace(/[!.]+$/, '');
  const footerBlock = `
    <div style="border-top:1px solid #000000; margin-top:${isCompact ? '12px' : '24px'}; padding-top:${isCompact ? '6px' : '12px'}; text-align:center; font-size:${isCompact ? '8.5px' : '10px'}; color:#000000">
      ${isReceipt ? 'Thank you for your payment!' : `Thank you for your business with ${bizName}`} ${bizEmail ? ` &nbsp;•&nbsp; email: ${bizEmail}` : ''}
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
        <title>${inv.invoiceNumber || 'invoice'}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 0mm;
          }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .page-sheet {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: ${isCompact ? '8mm 10mm' : '14mm 16mm'} !important;
              box-shadow: none !important;
              border: none !important;
            }
            .inv-table-wrap {
              overflow: visible !important;
            }
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: ${fontFamily};
            font-size: ${isCompact ? '10px' : '11.5px'};
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: ${forPrint ? '#ffffff' : '#f8fafc'};
            -webkit-font-smoothing: antialiased;
          }
          .page-sheet {
            width: 100%;
            max-width: ${forPrint ? '100%' : '800px'};
            margin: 0 auto;
            padding: ${forPrint ? (isCompact ? '8mm 10mm' : '14mm 16mm') : (isCompact ? '14px 18px' : '24px')};
            background: #ffffff;
            min-height: ${forPrint ? '297mm' : 'auto'};
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }
          @media screen and (max-width: 640px) {
            body {
              padding: 0 !important;
              background: #ffffff !important;
            }
            .page-sheet {
              padding: 12px 10px !important;
              width: 100% !important;
            }
            .inv-header {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 10px !important;
            }
            .inv-header-left {
              max-width: 100% !important;
              width: 100% !important;
            }
            .inv-header-right {
              text-align: left !important;
              width: 100% !important;
              border-top: 1px dashed rgba(0,0,0,0.15) !important;
              padding-top: 8px !important;
            }
            .inv-parties, .inv-parties tbody, .inv-parties tr, .inv-parties td {
              display: block !important;
              width: 100% !important;
              padding: 0 !important;
            }
            .inv-party-billed {
              margin-bottom: 12px !important;
              padding-bottom: 10px !important;
              border-bottom: 1px dashed #e2e8f0 !important;
            }
            .inv-table-wrap {
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch !important;
              margin-bottom: 8px !important;
            }
            .inv-items-table {
              min-width: 440px !important;
            }
            .inv-total-wrap {
              width: 100% !important;
            }
            .inv-total-wrap table {
              width: 100% !important;
            }
            .inv-payment-table, .inv-payment-table tbody, .inv-payment-table tr, .inv-payment-table td {
              display: block !important;
              width: 100% !important;
              padding: 0 !important;
            }
            .inv-pay-extra {
              margin-top: 12px !important;
              text-align: left !important;
            }
            .qr-col {
              align-items: flex-start !important;
              text-align: left !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="page-sheet">
          <div>
            ${headerBlock}
            ${partiesBlock}
            ${tableBlock}
            ${advBox}
            ${paymentBlock}
            ${notesBlock}
            ${lutWarningBlock}
          </div>
          ${footerBlock}
        </div>
      </body>
    </html>
  `;
}

export function printInvoiceDocument(
  inv: any,
  style: 'classic' | 'modern' | 'compact' = 'classic',
  businessProfile: BusinessProfile = DEFAULT_BUSINESS_PROFILE,
  printAreaRefElement?: HTMLElement | null
) {
  const docName = (inv.invoiceNumber || 'invoice').trim();
  const originalTitle = document.title;
  document.title = docName;

  const restoreTitle = () => {
    document.title = originalTitle;
    window.removeEventListener('focus', restoreTitle);
  };
  window.addEventListener('focus', restoreTitle, { once: true });
  window.addEventListener('afterprint', restoreTitle, { once: true });
  setTimeout(restoreTitle, 10000);

  const html = buildInvoiceHTML(inv, style, true, businessProfile);

  // Mobile detection: Mobile browsers (iOS Safari, Chrome Mobile) block/ignore hidden iframe print
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  if (isMobile) {
    const printWin = window.open('', '_blank');
    if (printWin) {
      const mobilePrintHtml = html.replace('</head>', `
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <style>
          @media screen {
            .mobile-print-bar {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              z-index: 99999;
              background: #0f172a;
              color: #ffffff;
              padding: 12px 16px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .mobile-print-btn {
              background: #4f46e5;
              color: #ffffff;
              border: none;
              padding: 8px 16px;
              border-radius: 8px;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
            }
            .mobile-close-btn {
              background: rgba(255,255,255,0.15);
              color: #ffffff;
              border: none;
              padding: 8px 12px;
              border-radius: 8px;
              font-size: 12px;
              cursor: pointer;
            }
            body {
              padding-top: 60px !important;
            }
          }
          @media print {
            .mobile-print-bar { display: none !important; }
            body { padding-top: 0 !important; }
          }
        </style>
        </head>
      `).replace('<body>', `
        <body>
          <div class="mobile-print-bar">
            <span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${docName}</span>
            <div style="display:flex;gap:8px;">
              <button class="mobile-print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
              <button class="mobile-close-btn" onclick="window.close()">✕</button>
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                try { window.print(); } catch(e){}
              }, 400);
            };
          </script>
      `);
      printWin.document.open();
      printWin.document.write(mobilePrintHtml);
      printWin.document.title = docName;
      printWin.document.close();
      return;
    }
  }

  const pa = printAreaRefElement || document.body;
  const frameContainer = document.createElement('div');
  frameContainer.id = 'print-invoice-host';
  frameContainer.innerHTML = `<iframe id="pf-frame-shared" style="position:fixed;top:-10000px;left:-10000px;width:1000px;height:1400px;border:none;" srcdoc="${html.replace(/"/g, '&quot;')}"></iframe>`;
  pa.appendChild(frameContainer);

  const iframe = document.getElementById('pf-frame-shared') as HTMLIFrameElement;
  if (iframe) {
    iframe.onload = () => {
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.title = docName;
        }
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        const w = window.open('', '_blank', 'width=800,height=900');
        if (w) {
          w.document.write(html);
          w.document.title = docName;
          w.document.close();
          w.onload = () => w.print();
        }
      }
      setTimeout(() => {
        if (frameContainer.parentNode) {
          frameContainer.parentNode.removeChild(frameContainer);
        }
      }, 1000);
    };
  }
}

export function downloadInvoiceDocumentHtml(
  inv: any,
  style: 'classic' | 'modern' | 'compact' = 'classic',
  businessProfile: BusinessProfile = DEFAULT_BUSINESS_PROFILE
) {
  const html = buildInvoiceHTML(inv, style, false, businessProfile);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${inv.invoiceNumber || 'invoice'}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}
