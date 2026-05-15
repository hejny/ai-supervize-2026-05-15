/** Supported Czech VAT rate options for the MVP. */
export const VAT_RATE_OPTIONS = [
  { value: 21, label: "21 % - základní sazba" },
  { value: 12, label: "12 % - snížená sazba" },
  { value: 0, label: "0 % - bez DPH" },
] as const;

/** Supported VAT filing periods for the MVP. */
export const VAT_PERIOD_OPTIONS = [
  { value: "monthly", label: "Měsíční plátce" },
  { value: "quarterly", label: "Čtvrtletní plátce" },
] as const;

/** Standard Czech corporate income tax rate used for the MVP. */
export const CORPORATE_INCOME_TAX_RATE_PERCENT = 21;

/** Supported VAT rate values. */
export type VatRatePercent = (typeof VAT_RATE_OPTIONS)[number]["value"];

/** Supported VAT filing period values. */
export type VatPeriod = (typeof VAT_PERIOD_OPTIONS)[number]["value"];

/** Supported invoice groups in the application. */
export type TaxDocumentKind = "issued" | "received";

/** Company profile stored with the tax return workspace. */
export interface CompanyProfile {
  companyName: string;
  companyRegistrationNumber: string;
  taxIdentificationNumber: string;
  taxYear: string;
  vatPeriod: VatPeriod;
}

/** One issued or received tax document entered by the user. */
export interface TaxDocument {
  id: string;
  kind: TaxDocumentKind;
  documentNumber: string;
  partnerName: string;
  taxableDate: string;
  description: string;
  baseAmount: number;
  vatRatePercent: VatRatePercent;
}

/** Persisted application state for the MVP. */
export interface TaxApplicationState {
  companyProfile: CompanyProfile;
  taxDocuments: TaxDocument[];
}

/** Calculated totals for a single document. */
export interface DocumentTotals {
  vatAmount: number;
  grossAmount: number;
}

/** VAT return summary derived from the entered documents. */
export interface VatSummary {
  taxableSuppliesAmount: number;
  deductiblePurchasesAmount: number;
  outputVatAmount: number;
  inputVatAmount: number;
  vatBalanceAmount: number;
}

/** Basic corporate income tax summary derived from the entered documents. */
export interface CorporateIncomeTaxSummary {
  revenueAmount: number;
  expenseAmount: number;
  profitBeforeTaxAmount: number;
  taxBaseAmount: number;
  corporateIncomeTaxAmount: number;
  corporateIncomeTaxRatePercent: number;
}

/** Full result used by the UI tax return preview. */
export interface TaxComputationResult {
  issuedDocumentsCount: number;
  receivedDocumentsCount: number;
  vatSummary: VatSummary;
  corporateIncomeTaxSummary: CorporateIncomeTaxSummary;
}

/** Default company profile for a fresh workspace. */
export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: "",
  companyRegistrationNumber: "",
  taxIdentificationNumber: "",
  taxYear: String(new Date().getFullYear()),
  vatPeriod: "monthly",
};

/** Default persisted application state for a fresh workspace. */
export const DEFAULT_TAX_APPLICATION_STATE: TaxApplicationState = {
  companyProfile: DEFAULT_COMPANY_PROFILE,
  taxDocuments: [],
};

/**
 * Rounds a numeric value to Czech crown precision.
 *
 * @param amount Amount in CZK.
 * @returns Rounded amount with two decimals.
 */
export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates VAT and gross totals for a single document.
 *
 * @param taxDocument Entered tax document.
 * @returns Document totals derived from the VAT rate.
 */
export function calculateDocumentTotals(
  taxDocument: TaxDocument,
): DocumentTotals {
  const vatAmount = roundCurrency(
    taxDocument.baseAmount * (taxDocument.vatRatePercent / 100),
  );

  return {
    vatAmount,
    grossAmount: roundCurrency(taxDocument.baseAmount + vatAmount),
  };
}

/**
 * Calculates the MVP VAT and corporate income tax summaries.
 *
 * @param taxDocuments All issued and received documents entered by the user.
 * @returns Computed tax overview used in the UI.
 */
export function calculateTaxComputationResult(
  taxDocuments: TaxDocument[],
): TaxComputationResult {
  const issuedDocuments = taxDocuments.filter(
    ({ kind }) => kind === "issued",
  );
  const receivedDocuments = taxDocuments.filter(
    ({ kind }) => kind === "received",
  );

  const taxableSuppliesAmount = roundCurrency(
    issuedDocuments.reduce(
      (totalAmount, taxDocument) => totalAmount + taxDocument.baseAmount,
      0,
    ),
  );
  const deductiblePurchasesAmount = roundCurrency(
    receivedDocuments.reduce(
      (totalAmount, taxDocument) => totalAmount + taxDocument.baseAmount,
      0,
    ),
  );
  const outputVatAmount = roundCurrency(
    issuedDocuments.reduce(
      (totalAmount, taxDocument) =>
        totalAmount + calculateDocumentTotals(taxDocument).vatAmount,
      0,
    ),
  );
  const inputVatAmount = roundCurrency(
    receivedDocuments.reduce(
      (totalAmount, taxDocument) =>
        totalAmount + calculateDocumentTotals(taxDocument).vatAmount,
      0,
    ),
  );
  const vatBalanceAmount = roundCurrency(outputVatAmount - inputVatAmount);
  const profitBeforeTaxAmount = roundCurrency(
    taxableSuppliesAmount - deductiblePurchasesAmount,
  );
  const taxBaseAmount = roundCurrency(Math.max(profitBeforeTaxAmount, 0));
  const corporateIncomeTaxAmount = roundCurrency(
    taxBaseAmount * (CORPORATE_INCOME_TAX_RATE_PERCENT / 100),
  );

  return {
    issuedDocumentsCount: issuedDocuments.length,
    receivedDocumentsCount: receivedDocuments.length,
    vatSummary: {
      taxableSuppliesAmount,
      deductiblePurchasesAmount,
      outputVatAmount,
      inputVatAmount,
      vatBalanceAmount,
    },
    corporateIncomeTaxSummary: {
      revenueAmount: taxableSuppliesAmount,
      expenseAmount: deductiblePurchasesAmount,
      profitBeforeTaxAmount,
      taxBaseAmount,
      corporateIncomeTaxAmount,
      corporateIncomeTaxRatePercent: CORPORATE_INCOME_TAX_RATE_PERCENT,
    },
  };
}

/**
 * Validates and normalizes the persisted local workspace.
 *
 * @param value Parsed JSON value from browser storage.
 * @returns Normalized application state safe for rendering.
 */
export function normalizeTaxApplicationState(
  value: unknown,
): TaxApplicationState {
  if (!value || typeof value !== "object") {
    return DEFAULT_TAX_APPLICATION_STATE;
  }

  const storedState = value as Partial<TaxApplicationState>;
  const storedCompanyProfile = (storedState.companyProfile ??
    {}) as Partial<CompanyProfile>;
  const storedTaxDocuments = Array.isArray(storedState.taxDocuments)
    ? storedState.taxDocuments
    : [];

  return {
    companyProfile: {
      companyName:
        typeof storedCompanyProfile.companyName === "string"
          ? storedCompanyProfile.companyName
          : DEFAULT_COMPANY_PROFILE.companyName,
      companyRegistrationNumber:
        typeof storedCompanyProfile.companyRegistrationNumber === "string"
          ? storedCompanyProfile.companyRegistrationNumber
          : DEFAULT_COMPANY_PROFILE.companyRegistrationNumber,
      taxIdentificationNumber:
        typeof storedCompanyProfile.taxIdentificationNumber === "string"
          ? storedCompanyProfile.taxIdentificationNumber
          : DEFAULT_COMPANY_PROFILE.taxIdentificationNumber,
      taxYear:
        typeof storedCompanyProfile.taxYear === "string"
          ? storedCompanyProfile.taxYear
          : DEFAULT_COMPANY_PROFILE.taxYear,
      vatPeriod:
        storedCompanyProfile.vatPeriod === "quarterly"
          ? "quarterly"
          : DEFAULT_COMPANY_PROFILE.vatPeriod,
    },
    taxDocuments: storedTaxDocuments.flatMap((storedTaxDocument) => {
      if (!storedTaxDocument || typeof storedTaxDocument !== "object") {
        return [];
      }

      const candidateTaxDocument = storedTaxDocument as Partial<TaxDocument>;
      const isSupportedKind =
        candidateTaxDocument.kind === "issued" ||
        candidateTaxDocument.kind === "received";
      const isSupportedVatRate =
        candidateTaxDocument.vatRatePercent === 21 ||
        candidateTaxDocument.vatRatePercent === 12 ||
        candidateTaxDocument.vatRatePercent === 0;

      if (
        typeof candidateTaxDocument.id !== "string" ||
        !isSupportedKind ||
        typeof candidateTaxDocument.documentNumber !== "string" ||
        typeof candidateTaxDocument.partnerName !== "string" ||
        typeof candidateTaxDocument.taxableDate !== "string" ||
        typeof candidateTaxDocument.description !== "string" ||
        typeof candidateTaxDocument.baseAmount !== "number" ||
        !Number.isFinite(candidateTaxDocument.baseAmount) ||
        !isSupportedVatRate
      ) {
        return [];
      }

      const normalizedKind = candidateTaxDocument.kind as TaxDocumentKind;
      const normalizedVatRatePercent =
        candidateTaxDocument.vatRatePercent as VatRatePercent;

      return [
        {
          id: candidateTaxDocument.id,
          kind: normalizedKind,
          documentNumber: candidateTaxDocument.documentNumber,
          partnerName: candidateTaxDocument.partnerName,
          taxableDate: candidateTaxDocument.taxableDate,
          description: candidateTaxDocument.description,
          baseAmount: roundCurrency(candidateTaxDocument.baseAmount),
          vatRatePercent: normalizedVatRatePercent,
        },
      ];
    }),
  };
}
