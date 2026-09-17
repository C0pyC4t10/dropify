"use client";

import { Printer } from "lucide-react";

/** Mobile-friendly "Print / Save as PDF" button. On iPhone this opens the
 *  system print sheet → user taps Share icon → "Save to Files" or
 *  "Mail" → PDF on the device. Same effect as desktop window.print()
 *  but works on phones where the OS print dialog is not a desktop window. */
export function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-primary"
      style={{ minHeight: 48, fontSize: 15 }}
    >
      <Printer size={16} /> Print / Save as PDF
    </button>
  );
}