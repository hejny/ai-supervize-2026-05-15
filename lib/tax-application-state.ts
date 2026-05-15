import type {
  TaxApplicationState,
  TaxDocument,
  TaxDocumentKind,
  VatRatePercent,
} from "@/lib/tax-calculations";
import { roundCurrency } from "@/lib/tax-calculations";

/** Browser storage key used by the MVP workspace. */
export const TAX_APPLICATION_LOCAL_STORAGE_KEY = "tax-return-mvp-state-v1";

/** Input required to create a new tax document in the shared workspace state. */
export interface CreateTaxDocumentInput {
  kind: TaxDocumentKind;
  documentNumber: string;
  partnerName: string;
  taxableDate: string;
  description: string;
  baseAmount: number;
  vatRatePercent: VatRatePercent;
}

/** Partial update payload for one existing tax document. */
export interface UpdateTaxDocumentInput {
  taxDocumentId: string;
  kind?: TaxDocumentKind;
  documentNumber?: string;
  partnerName?: string;
  taxableDate?: string;
  description?: string;
  baseAmount?: number;
  vatRatePercent?: VatRatePercent;
}

/**
 * Creates a unique identifier for a newly inserted tax document.
 *
 * @param kind Whether the document belongs to issued or received documents.
 * @returns Stable-enough client-side identifier for local workspace state.
 */
export function createTaxDocumentId(kind: TaxDocumentKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Creates one normalized tax document entity from a creation payload.
 *
 * @param taxDocumentInput Input provided by the UI or AI tools.
 * @returns New tax document ready to store.
 */
export function createTaxDocument(
  taxDocumentInput: CreateTaxDocumentInput,
): TaxDocument {
  return {
    id: createTaxDocumentId(taxDocumentInput.kind),
    kind: taxDocumentInput.kind,
    documentNumber: taxDocumentInput.documentNumber.trim(),
    partnerName: taxDocumentInput.partnerName.trim(),
    taxableDate: taxDocumentInput.taxableDate,
    description: taxDocumentInput.description.trim(),
    baseAmount: roundCurrency(taxDocumentInput.baseAmount),
    vatRatePercent: taxDocumentInput.vatRatePercent,
  };
}

/**
 * Adds one new document to the beginning of the persisted workspace state.
 *
 * @param taxApplicationState Current persisted application state.
 * @param taxDocumentInput Document data to append.
 * @returns Updated application state with the new document.
 */
export function addTaxDocumentToState(
  taxApplicationState: TaxApplicationState,
  taxDocumentInput: CreateTaxDocumentInput,
): TaxApplicationState {
  const nextTaxDocument = createTaxDocument(taxDocumentInput);

  return {
    ...taxApplicationState,
    taxDocuments: [nextTaxDocument, ...taxApplicationState.taxDocuments],
  };
}

/**
 * Finds one stored document by its identifier.
 *
 * @param taxApplicationState Current persisted application state.
 * @param taxDocumentId Stored document identifier.
 * @returns Matching document or `undefined` when it does not exist.
 */
export function findTaxDocumentById(
  taxApplicationState: TaxApplicationState,
  taxDocumentId: string,
): TaxDocument | undefined {
  return taxApplicationState.taxDocuments.find(({ id }) => id === taxDocumentId);
}

/**
 * Applies a partial update to one existing tax document.
 *
 * @param taxApplicationState Current persisted application state.
 * @param taxDocumentInput Partial update payload.
 * @returns Updated application state.
 */
export function updateTaxDocumentInState(
  taxApplicationState: TaxApplicationState,
  taxDocumentInput: UpdateTaxDocumentInput,
): TaxApplicationState {
  return {
    ...taxApplicationState,
    taxDocuments: taxApplicationState.taxDocuments.map((taxDocument) => {
      if (taxDocument.id !== taxDocumentInput.taxDocumentId) {
        return taxDocument;
      }

      return {
        ...taxDocument,
        kind: taxDocumentInput.kind ?? taxDocument.kind,
        documentNumber:
          taxDocumentInput.documentNumber?.trim() ?? taxDocument.documentNumber,
        partnerName:
          taxDocumentInput.partnerName?.trim() ?? taxDocument.partnerName,
        taxableDate: taxDocumentInput.taxableDate ?? taxDocument.taxableDate,
        description:
          taxDocumentInput.description?.trim() ?? taxDocument.description,
        baseAmount:
          taxDocumentInput.baseAmount === undefined
            ? taxDocument.baseAmount
            : roundCurrency(taxDocumentInput.baseAmount),
        vatRatePercent:
          taxDocumentInput.vatRatePercent ?? taxDocument.vatRatePercent,
      };
    }),
  };
}

/**
 * Removes one document from the persisted workspace state.
 *
 * @param taxApplicationState Current persisted application state.
 * @param taxDocumentId Stored document identifier.
 * @returns Updated application state without the removed document.
 */
export function deleteTaxDocumentFromState(
  taxApplicationState: TaxApplicationState,
  taxDocumentId: string,
): TaxApplicationState {
  return {
    ...taxApplicationState,
    taxDocuments: taxApplicationState.taxDocuments.filter(
      ({ id }) => id !== taxDocumentId,
    ),
  };
}
