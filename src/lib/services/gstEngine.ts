export interface GSTRule {
  id: string;
  clientLocation: 'domestic' | 'international' | 'any';
  paymentSource: 'foreign_remittance' | 'indian_bank' | 'any';
  gstTreatment: 'gst_applicable' | 'lut_export';
  gstRate: number; // e.g. 18 or 0
  description: string;
}

// Configurable default rules based on client location and payment source
export const DEFAULT_GST_RULES: GSTRule[] = [
  {
    id: 'rule-1',
    clientLocation: 'domestic',
    paymentSource: 'any',
    gstTreatment: 'gst_applicable',
    gstRate: 18,
    description: 'If Client Location = Domestic -> GST Applicable (18%)'
  },
  {
    id: 'rule-2',
    clientLocation: 'international',
    paymentSource: 'foreign_remittance',
    gstTreatment: 'lut_export',
    gstRate: 0,
    description: 'If Client Location = International AND Payment Source = Foreign Remittance -> LUT / Export of Services (No GST)'
  },
  {
    id: 'rule-3',
    clientLocation: 'international',
    paymentSource: 'indian_bank',
    gstTreatment: 'gst_applicable',
    gstRate: 18,
    description: 'If Client Location = International AND Payment Source = Indian Bank Account -> GST Applicable (18%)'
  }
];

export function determineGSTTreatment(
  location: 'domestic' | 'international',
  paymentSource: 'foreign_remittance' | 'indian_bank',
  rules: GSTRule[] = DEFAULT_GST_RULES
): { gstTreatment: 'gst_applicable' | 'lut_export'; gstRate: number; ruleId: string } {
  for (const rule of rules) {
    const matchLocation = rule.clientLocation === 'any' || rule.clientLocation === location;
    const matchPayment = rule.paymentSource === 'any' || rule.paymentSource === paymentSource;
    if (matchLocation && matchPayment) {
      return {
        gstTreatment: rule.gstTreatment,
        gstRate: rule.gstRate,
        ruleId: rule.id
      };
    }
  }
  // Fallback default
  return {
    gstTreatment: 'gst_applicable',
    gstRate: 18,
    ruleId: 'fallback'
  };
}

export function classifyClientCategory(
  location: 'domestic' | 'international',
  type: 'business' | 'individual'
): 'Domestic Business' | 'Domestic Individual' | 'International Business' | 'International Individual' {
  if (location === 'domestic') {
    return type === 'business' ? 'Domestic Business' : 'Domestic Individual';
  } else {
    return type === 'business' ? 'International Business' : 'International Individual';
  }
}

export const INDIAN_STATES = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' }
];

/**
 * Determines whether a client can appear in the invoice generator (must be active).
 */
export function isClientInvoiceReady(client?: {
  status?: string;
} | null): boolean {
  if (!client) return false;
  return client.status !== 'inactive';
}
