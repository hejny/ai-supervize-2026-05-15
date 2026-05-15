"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TaxApplicationState } from "@/lib/tax-calculations";
import {
  DEFAULT_TAX_APPLICATION_STATE,
  normalizeTaxApplicationState,
} from "@/lib/tax-calculations";
import {
  addTaxDocumentToState,
  deleteTaxDocumentFromState,
  TAX_APPLICATION_LOCAL_STORAGE_KEY,
  type CreateTaxDocumentInput,
} from "@/lib/tax-application-state";

/** Shared data and actions exposed to any UI that works with the tax workspace. */
interface TaxApplicationStateContextValue {
  taxApplicationState: TaxApplicationState;
  isStorageReady: boolean;
  storageStatusMessage: string;
  setStorageStatusMessage: (storageStatusMessage: string) => void;
  replaceTaxApplicationState: (
    taxApplicationState: TaxApplicationState,
    storageStatusMessage?: string,
  ) => void;
  updateCompanyProfileField: (
    fieldName: keyof TaxApplicationState["companyProfile"],
    fieldValue: string,
  ) => void;
  addTaxDocument: (taxDocumentInput: CreateTaxDocumentInput) => void;
  deleteTaxDocument: (taxDocumentId: string) => void;
  resetTaxApplicationState: () => void;
}

/** Context carrying the shared application state between pages and the floating agent. */
const TaxApplicationStateContext =
  createContext<TaxApplicationStateContextValue | null>(null);

/**
 * Provides persisted application state backed by `localStorage`.
 *
 * @param props Provider props.
 * @returns Context provider for the shared tax workspace state.
 */
export function TaxApplicationStateProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [taxApplicationState, setTaxApplicationState] =
    useState<TaxApplicationState>(DEFAULT_TAX_APPLICATION_STATE);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [storageStatusMessage, setStorageStatusMessage] = useState(
    "Načítám lokálně uložená data…",
  );

  useEffect(() => {
    const animationFrameId = window.requestAnimationFrame(() => {
      try {
        const storedValue = window.localStorage.getItem(
          TAX_APPLICATION_LOCAL_STORAGE_KEY,
        );

        if (storedValue) {
          const parsedValue = JSON.parse(storedValue) as unknown;
          setTaxApplicationState(normalizeTaxApplicationState(parsedValue));
          setStorageStatusMessage(
            "Doklady a přiznání se ukládají automaticky do tohoto prohlížeče.",
          );
        } else {
          setStorageStatusMessage(
            "Pracujete s novým přehledem. Data se budou ukládat automaticky.",
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Nepodařilo se načíst data.";

        window.localStorage.removeItem(TAX_APPLICATION_LOCAL_STORAGE_KEY);
        setStorageStatusMessage(
          `Lokální data byla neplatná a byla resetována: ${errorMessage}`,
        );
      } finally {
        setIsStorageReady(true);
      }
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    window.localStorage.setItem(
      TAX_APPLICATION_LOCAL_STORAGE_KEY,
      JSON.stringify(taxApplicationState),
    );
  }, [isStorageReady, taxApplicationState]);

  const contextValue = useMemo<TaxApplicationStateContextValue>(() => {
    return {
      taxApplicationState,
      isStorageReady,
      storageStatusMessage,
      setStorageStatusMessage,
      replaceTaxApplicationState(
        nextTaxApplicationState: TaxApplicationState,
        nextStorageStatusMessage = "Data byla aktualizována.",
      ) {
        setTaxApplicationState(nextTaxApplicationState);
        setStorageStatusMessage(nextStorageStatusMessage);
      },
      updateCompanyProfileField(
        fieldName: keyof TaxApplicationState["companyProfile"],
        fieldValue: string,
      ) {
        setTaxApplicationState((currentTaxApplicationState) => ({
          ...currentTaxApplicationState,
          companyProfile: {
            ...currentTaxApplicationState.companyProfile,
            [fieldName]: fieldValue,
          },
        }));
      },
      addTaxDocument(taxDocumentInput: CreateTaxDocumentInput) {
        setTaxApplicationState((currentTaxApplicationState) =>
          addTaxDocumentToState(currentTaxApplicationState, taxDocumentInput),
        );
        setStorageStatusMessage(
          `${
            taxDocumentInput.kind === "issued"
              ? "Vydané doklady"
              : "Přijaté doklady"
          } byly aktualizovány a uložené lokálně.`,
        );
      },
      deleteTaxDocument(taxDocumentId: string) {
        setTaxApplicationState((currentTaxApplicationState) =>
          deleteTaxDocumentFromState(currentTaxApplicationState, taxDocumentId),
        );
        setStorageStatusMessage("Doklad byl odstraněn a změna byla uložena.");
      },
      resetTaxApplicationState() {
        window.localStorage.removeItem(TAX_APPLICATION_LOCAL_STORAGE_KEY);
        setTaxApplicationState(DEFAULT_TAX_APPLICATION_STATE);
        setStorageStatusMessage("Lokálně uložená data byla smazána.");
      },
    };
  }, [isStorageReady, storageStatusMessage, taxApplicationState]);

  return (
    <TaxApplicationStateContext.Provider value={contextValue}>
      {children}
    </TaxApplicationStateContext.Provider>
  );
}

/**
 * Reads the shared tax workspace context.
 *
 * @returns Shared application state and mutation helpers.
 */
export function useTaxApplicationState(): TaxApplicationStateContextValue {
  const taxApplicationStateContext = useContext(TaxApplicationStateContext);

  if (taxApplicationStateContext === null) {
    throw new Error(
      "Hook `useTaxApplicationState` musí být použit uvnitř `TaxApplicationStateProvider`.",
    );
  }

  return taxApplicationStateContext;
}
