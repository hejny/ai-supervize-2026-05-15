"use client";

import { useMemo, useState } from "react";
import type {
  TaxDocument,
  TaxDocumentKind,
  VatRatePercent,
} from "@/lib/tax-calculations";
import { useTaxApplicationState } from "@/app/_components/tax-application-state-provider";
import {
  VAT_PERIOD_OPTIONS,
  VAT_RATE_OPTIONS,
  calculateDocumentTotals,
  calculateTaxComputationResult,
} from "@/lib/tax-calculations";
import { roundCurrency } from "@/lib/tax-calculations";

/** Currency formatter shared by all monetary UI elements. */
const CURRENCY_FORMATTER = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Labels used to present document groups in the UI. */
const DOCUMENT_KIND_LABELS: Record<TaxDocumentKind, string> = {
  issued: "Vydané doklady",
  received: "Přijaté doklady",
};

/** Draft fields that surface inline validation feedback in the UI. */
const TAX_DOCUMENT_DRAFT_VALIDATION_FIELD_NAMES = [
  "documentNumber",
  "partnerName",
  "taxableDate",
  "baseAmount",
] as const;

/** Draft document values used by the input forms. */
interface TaxDocumentDraft {
  documentNumber: string;
  partnerName: string;
  taxableDate: string;
  description: string;
  baseAmount: string;
  vatRatePercent: VatRatePercent;
}

/** Field names that can contain a validation error message. */
type TaxDocumentDraftValidationFieldName =
  (typeof TAX_DOCUMENT_DRAFT_VALIDATION_FIELD_NAMES)[number];

/** Inline validation messages for the draft document form. */
interface TaxDocumentDraftValidationErrors {
  documentNumber?: string;
  partnerName?: string;
  taxableDate?: string;
  baseAmount?: string;
}

/** Props for the repeated summary card component. */
interface SummaryCardProps {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}

/** Props for the document table component. */
interface DocumentTableProps {
  taxDocuments: TaxDocument[];
  onDelete: (id: string) => void;
}

/**
 * Creates a fresh draft for a new document form.
 *
 * @returns Empty document draft with a sensible VAT default.
 */
function createEmptyTaxDocumentDraft(): TaxDocumentDraft {
  return {
    documentNumber: "",
    partnerName: "",
    taxableDate: "",
    description: "",
    baseAmount: "",
    vatRatePercent: 21,
  };
}

/**
 * Creates an empty validation state for a draft document form.
 *
 * @returns Empty validation message map.
 */
function createEmptyTaxDocumentDraftValidationErrors(): TaxDocumentDraftValidationErrors {
  return {};
}

/**
 * Parses the base amount from the current draft form.
 *
 * @param baseAmount Raw base amount from the input field.
 * @returns Parsed numeric amount.
 */
function parseTaxDocumentDraftBaseAmount(baseAmount: string): number {
  return Number(baseAmount.replace(",", "."));
}

/**
 * Checks whether a draft field participates in inline validation.
 *
 * @param fieldName Draft field to check.
 * @returns `true` when the field has a dedicated validation message slot.
 */
function isTaxDocumentDraftValidationFieldName(
  fieldName: keyof TaxDocumentDraft,
): fieldName is TaxDocumentDraftValidationFieldName {
  return TAX_DOCUMENT_DRAFT_VALIDATION_FIELD_NAMES.includes(
    fieldName as TaxDocumentDraftValidationFieldName,
  );
}

/**
 * Validates the draft document form and returns field-level feedback.
 *
 * @param taxDocumentDraft Draft values entered by the user.
 * @returns Validation messages for invalid fields.
 */
function validateTaxDocumentDraft(
  taxDocumentDraft: TaxDocumentDraft,
): TaxDocumentDraftValidationErrors {
  const validationErrors: TaxDocumentDraftValidationErrors = {};
  const parsedBaseAmount = parseTaxDocumentDraftBaseAmount(
    taxDocumentDraft.baseAmount,
  );

  if (!taxDocumentDraft.documentNumber.trim()) {
    validationErrors.documentNumber = "Vyplňte číslo dokladu.";
  }

  if (!taxDocumentDraft.partnerName.trim()) {
    validationErrors.partnerName = "Vyplňte partnera.";
  }

  if (!taxDocumentDraft.taxableDate) {
    validationErrors.taxableDate = "Vyplňte DUZP.";
  }

  if (!taxDocumentDraft.baseAmount.trim()) {
    validationErrors.baseAmount = "Vyplňte základ daně.";
  } else if (!Number.isFinite(parsedBaseAmount)) {
    validationErrors.baseAmount = "Zadejte platný základ daně.";
  } else if (parsedBaseAmount < 0) {
    validationErrors.baseAmount = "Základ daně nemůže být záporný.";
  }

  return validationErrors;
}

/**
 * Tells whether the draft validation state contains any visible error.
 *
 * @param validationErrors Draft validation messages.
 * @returns `true` when at least one field is invalid.
 */
function hasTaxDocumentDraftValidationErrors(
  validationErrors: TaxDocumentDraftValidationErrors,
): boolean {
  return TAX_DOCUMENT_DRAFT_VALIDATION_FIELD_NAMES.some(
    (fieldName) => validationErrors[fieldName] !== undefined,
  );
}

/**
 * Returns input classes that highlight invalid draft fields.
 *
 * @param validationErrorMessage Validation message for the current field.
 * @returns Tailwind class list for the form control.
 */
function getTaxDocumentDraftInputClassName(
  validationErrorMessage?: string,
): string {
  return [
    "w-full rounded-2xl px-4 py-3 outline-none transition",
    validationErrorMessage
      ? "border border-rose-300 bg-rose-50 focus:border-rose-400"
      : "border border-slate-200 focus:border-slate-400",
  ].join(" ");
}

/**
 * Formats a CZK amount for display.
 *
 * @param amount Numeric amount in CZK.
 * @returns Localized currency string.
 */
function formatCurrency(amount: number): string {
  return CURRENCY_FORMATTER.format(roundCurrency(amount));
}

/**
 * Returns tone classes for a dashboard summary card.
 *
 * @param tone Semantic tone of the card.
 * @returns Tailwind class list for the card shell.
 */
function getSummaryCardToneClassName(
  tone: SummaryCardProps["tone"] = "neutral",
): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50";
    case "warning":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-slate-200 bg-white";
  }
}

/**
 * Renders a compact summary card.
 *
 * @param props Summary card props.
 * @returns Summary card JSX.
 */
function SummaryCard({ label, value, tone = "neutral" }: SummaryCardProps) {
  return (
    <article
      className={`rounded-2xl border p-5 shadow-sm ${getSummaryCardToneClassName(
        tone,
      )}`}
    >
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}

/**
 * Renders a table of entered documents for one document group.
 *
 * @param props Document table props.
 * @returns Document table JSX.
 */
function DocumentTable({ taxDocuments, onDelete }: DocumentTableProps) {
  if (taxDocuments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        Zatím tu nejsou žádné doklady.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 bg-white">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Doklad</th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">DUZP</th>
              <th className="px-4 py-3">Základ</th>
              <th className="px-4 py-3">DPH</th>
              <th className="px-4 py-3">Celkem</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {taxDocuments.map((taxDocument) => {
              const documentTotals = calculateDocumentTotals(taxDocument);

              return (
                <tr key={taxDocument.id}>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-slate-900">
                      {taxDocument.documentNumber}
                    </div>
                    <div className="text-slate-500">
                      {taxDocument.description || "Bez poznámky"}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">{taxDocument.partnerName}</td>
                  <td className="px-4 py-3 align-top">{taxDocument.taxableDate}</td>
                  <td className="px-4 py-3 align-top">
                    {formatCurrency(taxDocument.baseAmount)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {formatCurrency(documentTotals.vatAmount)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {formatCurrency(documentTotals.grossAmount)}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(taxDocument.id)}
                      className="rounded-full px-3 py-1 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                    >
                      Smazat
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Main client-side tax return workspace.
 *
 * @returns Complete MVP UI for VAT and tax return preparation.
 */
export default function TaxReturnApp() {
  const {
    storageStatusMessage,
    setStorageStatusMessage,
    taxApplicationState,
    updateCompanyProfileField,
    addTaxDocument,
    deleteTaxDocument,
    resetTaxApplicationState,
  } = useTaxApplicationState();
  const [taxDocumentDrafts, setTaxDocumentDrafts] = useState<
    Record<TaxDocumentKind, TaxDocumentDraft>
  >({
    issued: createEmptyTaxDocumentDraft(),
    received: createEmptyTaxDocumentDraft(),
  });
  const [taxDocumentDraftValidationErrors, setTaxDocumentDraftValidationErrors] =
    useState<Record<TaxDocumentKind, TaxDocumentDraftValidationErrors>>({
      issued: createEmptyTaxDocumentDraftValidationErrors(),
      received: createEmptyTaxDocumentDraftValidationErrors(),
    });

  const taxComputationResult = useMemo(
    () => calculateTaxComputationResult(taxApplicationState.taxDocuments),
    [taxApplicationState.taxDocuments],
  );
  const issuedTaxDocuments = taxApplicationState.taxDocuments.filter(
    ({ kind }) => kind === "issued",
  );
  const receivedTaxDocuments = taxApplicationState.taxDocuments.filter(
    ({ kind }) => kind === "received",
  );
  const isVatPayable = taxComputationResult.vatSummary.vatBalanceAmount >= 0;

  function updateTaxDocumentDraftField(
    kind: TaxDocumentKind,
    fieldName: keyof TaxDocumentDraft,
    fieldValue: string | VatRatePercent,
  ) {
    setTaxDocumentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [kind]: {
        ...currentDrafts[kind],
        [fieldName]: fieldValue,
      },
    }));

    if (isTaxDocumentDraftValidationFieldName(fieldName)) {
      setTaxDocumentDraftValidationErrors((currentValidationErrors) => {
        if (!currentValidationErrors[kind][fieldName]) {
          return currentValidationErrors;
        }

        return {
          ...currentValidationErrors,
          [kind]: {
            ...currentValidationErrors[kind],
            [fieldName]: undefined,
          },
        };
      });
    }
  }

  function handleAddTaxDocument(kind: TaxDocumentKind) {
    const draft = taxDocumentDrafts[kind];
    const validationErrors = validateTaxDocumentDraft(draft);

    if (hasTaxDocumentDraftValidationErrors(validationErrors)) {
      setTaxDocumentDraftValidationErrors((currentValidationErrors) => ({
        ...currentValidationErrors,
        [kind]: validationErrors,
      }));
      setStorageStatusMessage(
        "Formulář dokladu obsahuje chyby. Opravte zvýrazněná pole a zkuste to znovu.",
      );
      return;
    }

    const parsedBaseAmount = parseTaxDocumentDraftBaseAmount(draft.baseAmount);
    addTaxDocument({
      kind,
      documentNumber: draft.documentNumber.trim(),
      partnerName: draft.partnerName.trim(),
      taxableDate: draft.taxableDate,
      description: draft.description.trim(),
      baseAmount: roundCurrency(parsedBaseAmount),
      vatRatePercent: draft.vatRatePercent,
    });
    setTaxDocumentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [kind]: createEmptyTaxDocumentDraft(),
    }));
    setTaxDocumentDraftValidationErrors((currentValidationErrors) => ({
      ...currentValidationErrors,
      [kind]: createEmptyTaxDocumentDraftValidationErrors(),
    }));
  }

  function handleDeleteTaxDocument(taxDocumentId: string) {
    deleteTaxDocument(taxDocumentId);
  }

  function handleResetWorkspace() {
    if (
      !window.confirm(
        "Opravdu chcete smazat všechny lokálně uložené doklady a přiznání?",
      )
    ) {
      return;
    }

    resetTaxApplicationState();
    setTaxDocumentDrafts({
      issued: createEmptyTaxDocumentDraft(),
      received: createEmptyTaxDocumentDraft(),
    });
    setTaxDocumentDraftValidationErrors({
      issued: createEmptyTaxDocumentDraftValidationErrors(),
      received: createEmptyTaxDocumentDraftValidationErrors(),
    });
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-slate-100">
                MVP pro s.r.o. v ČR
              </span>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Přehled DPH a daňového přiznání z vašich dokladů
              </h1>
              <p className="text-base leading-7 text-slate-300">
                Zadejte vydané a přijaté doklady, aplikace spočítá základní DPH a
                připraví jednoduchý náhled daňového přiznání. Vše se ukládá pouze
                lokálně v tomto prohlížeči.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Stav lokálního uložení</p>
              <p className="mt-2 max-w-md leading-6 text-slate-300">
                {storageStatusMessage}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Vydané doklady"
            value={String(taxComputationResult.issuedDocumentsCount)}
          />
          <SummaryCard
            label="Přijaté doklady"
            value={String(taxComputationResult.receivedDocumentsCount)}
          />
          <SummaryCard
            label="DPH bilance"
            value={formatCurrency(taxComputationResult.vatSummary.vatBalanceAmount)}
            tone={isVatPayable ? "warning" : "success"}
          />
          <SummaryCard
            label="Daň z příjmů"
            value={formatCurrency(
              taxComputationResult.corporateIncomeTaxSummary
                .corporateIncomeTaxAmount,
            )}
            tone="neutral"
          />
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Firma a přiznání
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Aplikace spravuje jednu firmu. Náhled přiznání je zjednodušený pro
                běžné případy a neřeší složitější úpravy základu daně, ztráty nebo
                speciální odpočty.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              Vymazat lokální data
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Název společnosti
              </span>
              <input
                value={taxApplicationState.companyProfile.companyName}
                onChange={(event) =>
                  updateCompanyProfileField("companyName", event.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
                placeholder="Např. ACME Software s.r.o."
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">IČO</span>
              <input
                value={
                  taxApplicationState.companyProfile.companyRegistrationNumber
                }
                onChange={(event) =>
                  updateCompanyProfileField(
                    "companyRegistrationNumber",
                    event.target.value,
                  )
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
                placeholder="12345678"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">DIČ</span>
              <input
                value={
                  taxApplicationState.companyProfile.taxIdentificationNumber
                }
                onChange={(event) =>
                  updateCompanyProfileField(
                    "taxIdentificationNumber",
                    event.target.value,
                  )
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
                placeholder="CZ12345678"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Zdaňovací rok
              </span>
              <input
                value={taxApplicationState.companyProfile.taxYear}
                onChange={(event) =>
                  updateCompanyProfileField("taxYear", event.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
                placeholder="2026"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Perioda DPH
              </span>
              <select
                value={taxApplicationState.companyProfile.vatPeriod}
                onChange={(event) =>
                  updateCompanyProfileField("vatPeriod", event.target.value)
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
              >
                {VAT_PERIOD_OPTIONS.map((vatPeriodOption) => (
                  <option
                    key={vatPeriodOption.value}
                    value={vatPeriodOption.value}
                  >
                    {vatPeriodOption.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          {(
            [
              ["issued", issuedTaxDocuments],
              ["received", receivedTaxDocuments],
            ] as const
          ).map(([kind, taxDocuments]) => {
            const validationErrors = taxDocumentDraftValidationErrors[kind];
            const isDraftInvalid =
              hasTaxDocumentDraftValidationErrors(validationErrors);

            return (
              <article key={kind} className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {DOCUMENT_KIND_LABELS[kind]}
                  </h2>
                  <p className="text-sm leading-6 text-slate-600">
                    Přidejte běžné tuzemské doklady. Základ daně a DPH se z nich
                    promítnou do souhrnu níže.
                  </p>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Číslo dokladu
                    </span>
                    <input
                      value={taxDocumentDrafts[kind].documentNumber}
                      onChange={(event) =>
                        updateTaxDocumentDraftField(
                          kind,
                          "documentNumber",
                          event.target.value,
                        )
                      }
                      aria-invalid={validationErrors.documentNumber !== undefined}
                      aria-describedby={
                        validationErrors.documentNumber
                          ? `${kind}-document-number-error`
                          : undefined
                      }
                      className={getTaxDocumentDraftInputClassName(
                        validationErrors.documentNumber,
                      )}
                      placeholder="2026-001"
                    />
                    {validationErrors.documentNumber && (
                      <p
                        id={`${kind}-document-number-error`}
                        className="text-sm text-rose-700"
                      >
                        {validationErrors.documentNumber}
                      </p>
                    )}
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Partner
                    </span>
                    <input
                      value={taxDocumentDrafts[kind].partnerName}
                      onChange={(event) =>
                        updateTaxDocumentDraftField(
                          kind,
                          "partnerName",
                          event.target.value,
                        )
                      }
                      aria-invalid={validationErrors.partnerName !== undefined}
                      aria-describedby={
                        validationErrors.partnerName
                          ? `${kind}-partner-name-error`
                          : undefined
                      }
                      className={getTaxDocumentDraftInputClassName(
                        validationErrors.partnerName,
                      )}
                      placeholder="Dodavatel nebo odběratel"
                    />
                    {validationErrors.partnerName && (
                      <p
                        id={`${kind}-partner-name-error`}
                        className="text-sm text-rose-700"
                      >
                        {validationErrors.partnerName}
                      </p>
                    )}
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">DUZP</span>
                    <input
                      type="date"
                      value={taxDocumentDrafts[kind].taxableDate}
                      onChange={(event) =>
                        updateTaxDocumentDraftField(
                          kind,
                          "taxableDate",
                          event.target.value,
                        )
                      }
                      aria-invalid={validationErrors.taxableDate !== undefined}
                      aria-describedby={
                        validationErrors.taxableDate
                          ? `${kind}-taxable-date-error`
                          : undefined
                      }
                      className={getTaxDocumentDraftInputClassName(
                        validationErrors.taxableDate,
                      )}
                    />
                    {validationErrors.taxableDate && (
                      <p
                        id={`${kind}-taxable-date-error`}
                        className="text-sm text-rose-700"
                      >
                        {validationErrors.taxableDate}
                      </p>
                    )}
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Základ daně
                    </span>
                    <input
                      inputMode="decimal"
                      value={taxDocumentDrafts[kind].baseAmount}
                      onChange={(event) =>
                        updateTaxDocumentDraftField(
                          kind,
                          "baseAmount",
                          event.target.value,
                        )
                      }
                      aria-invalid={validationErrors.baseAmount !== undefined}
                      aria-describedby={
                        validationErrors.baseAmount
                          ? `${kind}-base-amount-error`
                          : undefined
                      }
                      className={getTaxDocumentDraftInputClassName(
                        validationErrors.baseAmount,
                      )}
                      placeholder="10000"
                    />
                    {validationErrors.baseAmount && (
                      <p
                        id={`${kind}-base-amount-error`}
                        className="text-sm text-rose-700"
                      >
                        {validationErrors.baseAmount}
                      </p>
                    )}
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      Poznámka
                    </span>
                    <input
                      value={taxDocumentDrafts[kind].description}
                      onChange={(event) =>
                        updateTaxDocumentDraftField(
                          kind,
                          "description",
                          event.target.value,
                        )
                      }
                      className={getTaxDocumentDraftInputClassName()}
                      placeholder="Např. vývoj software nebo kancelářské potřeby"
                    />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      Sazba DPH
                    </span>
                    <select
                      value={taxDocumentDrafts[kind].vatRatePercent}
                      onChange={(event) =>
                        updateTaxDocumentDraftField(
                          kind,
                          "vatRatePercent",
                          Number(event.target.value) as VatRatePercent,
                        )
                      }
                      className={getTaxDocumentDraftInputClassName()}
                    >
                      {VAT_RATE_OPTIONS.map((vatRateOption) => (
                        <option key={vatRateOption.value} value={vatRateOption.value}>
                          {vatRateOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {isDraftInvalid && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    Opravte zvýrazněná pole a pak doklad znovu přidejte.
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleAddTaxDocument(kind)}
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Přidat doklad
                  </button>
                </div>

                <div className="mt-6">
                  <DocumentTable
                    taxDocuments={taxDocuments}
                    onDelete={handleDeleteTaxDocument}
                  />
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">
              Náhled přiznání k DPH
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Jednoduchý souhrn pro běžné tuzemské doklady. Oficiální XML export a
              elektronické podání jsou připravené jako další fáze vývoje.
            </p>

            <dl className="mt-6 grid gap-4 md:grid-cols-2">
              <SummaryCard
                label="Zdanitelná plnění na výstupu"
                value={formatCurrency(
                  taxComputationResult.vatSummary.taxableSuppliesAmount,
                )}
              />
              <SummaryCard
                label="Přijatá plnění pro odpočet"
                value={formatCurrency(
                  taxComputationResult.vatSummary.deductiblePurchasesAmount,
                )}
              />
              <SummaryCard
                label="DPH na výstupu"
                value={formatCurrency(
                  taxComputationResult.vatSummary.outputVatAmount,
                )}
                tone="warning"
              />
              <SummaryCard
                label="DPH na vstupu"
                value={formatCurrency(
                  taxComputationResult.vatSummary.inputVatAmount,
                )}
                tone="success"
              />
            </dl>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-600">
                Výsledek přiznání k DPH
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {formatCurrency(taxComputationResult.vatSummary.vatBalanceAmount)}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isVatPayable
                  ? "Kladná hodnota znamená DPH k odvodu finančnímu úřadu."
                  : "Záporná hodnota znamená nadměrný odpočet."}
              </p>
            </div>
          </article>

          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">
              Náhled daňového přiznání k dani z příjmů
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Pro MVP se vychází pouze z běžných výnosů a nákladů odvozených z
              dokladů. Ztráty, daňové úpravy a další speciální režimy se zatím
              nezohledňují.
            </p>

            <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">Výnosy</span>
                <strong className="text-slate-950">
                  {formatCurrency(
                    taxComputationResult.corporateIncomeTaxSummary.revenueAmount,
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">Náklady</span>
                <strong className="text-slate-950">
                  {formatCurrency(
                    taxComputationResult.corporateIncomeTaxSummary.expenseAmount,
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">Hospodářský výsledek</span>
                <strong className="text-slate-950">
                  {formatCurrency(
                    taxComputationResult.corporateIncomeTaxSummary
                      .profitBeforeTaxAmount,
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-600">Daňový základ</span>
                <strong className="text-slate-950">
                  {formatCurrency(
                    taxComputationResult.corporateIncomeTaxSummary.taxBaseAmount,
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-sm">
                <span className="text-slate-600">
                  Daň z příjmů právnických osob (
                  {
                    taxComputationResult.corporateIncomeTaxSummary
                      .corporateIncomeTaxRatePercent
                  }
                  %)
                </span>
                <strong className="text-lg text-slate-950">
                  {formatCurrency(
                    taxComputationResult.corporateIncomeTaxSummary
                      .corporateIncomeTaxAmount,
                  )}
                </strong>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight">
            Připraveno pro další rozšíření
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">
                OCR a vytěžení dokladů
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                MVP zatím pracuje s ručním zadáním. Struktura dokladů je ale
                připravená tak, aby šla později napojit mobilní kamera a vytěžení
                dat pomocí OpenAI Agents SDK.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">
                XML export pro elektronické podání
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Souhrny jsou oddělené od formulářů, takže lze doplnit generování
                XML podle oficiálních schémat finanční správy bez přestavby celé
                aplikace.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
