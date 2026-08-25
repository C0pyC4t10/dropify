/**
 * Delivery partners — managed via Settings. Each partner is shown on the
 * invoice footer when the user picks the "With Delivery Partner" invoice
 * format. The list is stored as part of the Settings JSON blob so the
 * user can add/edit/remove from /settings.
 */

export interface DeliveryPartner {
  /** Stable id (string) so the UI can key React lists. */
  id: string;
  name: string;
  phone?: string;
  website?: string;
  /** Free-text note shown beneath the name. */
  notes?: string;
}

/** Empty list — the user adds their own. Returned as the default when
 *  no partners have been added to settings yet. */
export const DEFAULT_DELIVERY_PARTNERS: DeliveryPartner[] = [];

/** Human label for the invoice format option. */
export const INVOICE_FORMAT_LABEL: Record<InvoiceFormat, string> = {
  standard: "Standard",
  partner: "With Delivery Partner",
};

export type InvoiceFormat = "standard" | "partner";
