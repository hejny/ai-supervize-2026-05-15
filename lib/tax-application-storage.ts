import type { TaxApplicationState } from "@/lib/tax-calculations";

/** Browser storage key used by the MVP workspace. */
export const TAX_APPLICATION_LOCAL_STORAGE_KEY = "tax-return-mvp-state-v1";

/** Browser event emitted when another app surface replaces the workspace state. */
export const TAX_APPLICATION_STATE_REPLACED_EVENT_NAME =
  "tax-application-state-replaced";

/** Detail payload for tax workspace replacement events. */
export interface TaxApplicationStateReplacedEventDetail {
  taxApplicationState: TaxApplicationState;
  statusMessage: string;
}

/** Browser event carrying a complete replacement of the local tax workspace. */
export type TaxApplicationStateReplacedEvent =
  CustomEvent<TaxApplicationStateReplacedEventDetail>;

/**
 * Broadcasts a local workspace replacement to client components on the page.
 *
 * @param detail Replacement state and user-facing status message.
 */
export function dispatchTaxApplicationStateReplacedEvent(
  detail: TaxApplicationStateReplacedEventDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<TaxApplicationStateReplacedEventDetail>(
      TAX_APPLICATION_STATE_REPLACED_EVENT_NAME,
      { detail },
    ),
  );
}
