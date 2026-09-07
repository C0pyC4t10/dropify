"use client";

import * as XLSX from "xlsx";
import { openPrintDocument } from "./print-html";

export type ExportColumn<T> = {
  header: string;
  /** Cell accessor. Return either a primitive (string/number/boolean) or a JSX node. */
  get: (row: T) => string | number | boolean | null | undefined;
  /** Optional pre-formatter that turns the value into a clean cell string (no React, used for XLSX & PDF text). */
  format?: (raw: string | number | boolean | null | undefined) => string;
  /**
   * Optional: name of an aggregate for the totals row. When set on any column,
   * a "TOTAL" row is appended at the bottom. Recognized values:
   *   "sum" — sum all numeric cells in this column
   *   "count" — count of non-empty rows in this column
   *   other — pass-through string used as the totals cell (e.g. "—")
   * If omitted, the totals cell is left blank.
   */
  total?: "sum" | "count" | string;
};

interface ExportOptions {
  filename: string; // without extension
  title?: string;
  /** Optional subtitle (printed under title in PDF). */
  subtitle?: string;
  /** Column orientation in PDF — "portrait" (default) or "landscape". */
  orientation?: "portrait" | "landscape";
  /** Business name shown in PDF header and XLSX metadata. */
  businessName?: string;
  /** Brand tagline shown under business name in PDF. */
  tagline?: string;
}

/** Flatten a value to a string for tabular export. */
function flatten(
  val: unknown,
  format?: (v: unknown) => string,
): string {
  if (val === null || val === undefined) return "";
  if (format) return format(val);
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

/** Trigger a browser download of a Blob with the given MIME and extension. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build the cell matrix from rows + columns. Returns array of arrays of strings. */
function buildMatrix<T>(rows: T[], cols: ExportColumn<T>[]): string[][] {
  return rows.map((row) =>
    cols.map((col) => flatten(col.get(row), col.format as (v: unknown) => string)),
  );
}

/**
 * Build the totals row, if any column declares a `total` aggregate.
 * Returns null when no column declares an aggregate.
 */
function buildTotalsRow<T>(
  matrix: string[][],
  cols: ExportColumn<T>[],
): string[] | null {
  if (!cols.some((c) => c.total)) return null;
  return cols.map((col, i) => {
    const agg = col.total;
    if (!agg) return "";
    if (agg === "count") {
      const n = matrix.filter((row) => (row[i] ?? "") !== "").length;
      return n > 0 ? String(n) : "";
    }
    if (agg === "sum") {
      let s = 0;
      let any = false;
      for (const row of matrix) {
        const v = row[i];
        if (v === undefined || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) {
          s += n;
          any = true;
        }
      }
      return any ? String(s) : "";
    }
    return agg; // literal string
  });
}

function timestamp(): string {
  const d = new Date();
  // Bangladesh UTC+6
  const bd = new Date(d.getTime() + 6 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    bd.getUTCFullYear() +
    pad(bd.getUTCMonth() + 1) +
    pad(bd.getUTCDate()) +
    "-" +
    pad(bd.getUTCHours()) +
    pad(bd.getUTCMinutes())
  );
}

/** Export rows to an .xlsx file. */
export function exportXLSX<T>(
  rows: T[],
  cols: ExportColumn<T>[],
  opts: ExportOptions,
) {
  const headers = cols.map((c) => c.header);
  const matrix = buildMatrix(rows, cols);
  const totalsRow = buildTotalsRow(matrix, cols);

  // Minimal layout: one merged header banner, then the table.
  // The totals row only contains values in columns that declared `total`.
  const headerRow: string[] = [
    `${opts.businessName || "Dropify"}  ·  ${opts.title || "Export"}${opts.subtitle ? "  ·  " + opts.subtitle : ""}`,
  ];
  const aoa: string[][] = [headerRow, headers];
  for (const row of matrix) aoa.push(row);
  let totalRowIdx = -1;
  if (totalsRow) {
    aoa.push(totalsRow);
    totalRowIdx = aoa.length - 1;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-size columns (cap at 50 chars)
  ws["!cols"] = headers.map((h, i) => {
    let max = h.length;
    for (const row of matrix) {
      const v = row[i] ?? "";
      if (v.length > max) max = v.length;
    }
    return { wch: Math.min(max + 2, 50) };
  });

  // Merge the banner row across every column
  ws["!merges"] = ws["!merges"] || [];
  if (headers.length > 1) {
    ws["!merges"].push({
      s: { r: 0, c: 0 },
      e: { r: 0, c: headers.length - 1 },
    });
  }

  // Banner styling — single bold header line
  const bannerAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  const bannerCell = ws[bannerAddr];
  if (bannerCell) {
    bannerCell.s = {
      font: { bold: true, sz: 12, color: { rgb: "0B120C" } },
      alignment: { vertical: "center", horizontal: "left" },
    };
  }

  // Table header — bold text + thin bottom border, no heavy fill
  const HEADER_ROW = 1;
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: HEADER_ROW, c });
    const cell = ws[addr];
    if (cell) {
      cell.s = {
        font: { bold: true, sz: 11 },
        border: { bottom: { style: "thin", color: { rgb: "999999" } } },
        alignment: { vertical: "center" },
      };
    }
  }

  // Totals row — bold + thin top border (no fill, no fanfare)
  if (totalRowIdx >= 0) {
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
      const cell = ws[addr];
      if (cell) {
        const hasVal = (totalsRow?.[c] ?? "") !== "";
        cell.s = {
          font: { bold: hasVal, sz: 11 },
          border: { top: { style: "thin", color: { rgb: "999999" } } },
        };
      }
    }
  }

  // Freeze the table header
  ws["!freeze"] = { xSplit: 0, ySplit: HEADER_ROW + 1 };

  // Workbook metadata
  wb.Props = {
    Title: opts.title || "Export",
    Subject: opts.subtitle || "",
    Author: opts.businessName || "Dropify",
    Company: opts.businessName || "",
  };

  XLSX.utils.book_append_sheet(wb, ws, opts.title?.slice(0, 31) || "Sheet1");
  XLSX.writeFile(wb, `${opts.filename}-${timestamp()}.xlsx`);
}

/** Export rows to a print-ready PDF via the browser's print dialog.
 * Uses native OS text shaping so Bengali conjuncts render correctly. */
export function exportPDF<T>(
  rows: T[],
  cols: ExportColumn<T>[],
  opts: ExportOptions,
) {
  const matrix = buildMatrix(rows, cols);
  const totalsRow = buildTotalsRow(matrix, cols);
  const body = totalsRow ? [...matrix, totalsRow] : matrix;
  const businessName = opts.businessName || "Dropify";
  const tagline = opts.tagline || "";
  const stamp = new Date().toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
  const brandInitials = businessName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  // Find numeric columns so we can right-align them in the table.
  const numericIdx = new Set<number>();
  cols.forEach((c, i) => {
    if (c.total === "sum" || c.total === "count") numericIdx.add(i);
  });

  const tableHtml = body.length === 0
    ? `<div class="empty">No rows to export.</div>`
    : `<table class="report">
        <thead>
          <tr>
            <th style="width:42px;">#</th>
            ${cols.map((c, i) => `<th class="${numericIdx.has(i) ? "num" : ""}">${esc(c.header)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${body.map((row, ri) => {
            const isTotal = totalsRow && ri === matrix.length;
            return `<tr${isTotal ? ' style="background:#f0f7f1;font-weight:700;"' : ""}>
              <td style="color:#888;">${ri + 1}</td>
              ${row.map((cell, ci) => `<td class="${numericIdx.has(ci) ? "num" : ""}">${esc(cell)}</td>`).join("")}
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;

  const orientation = opts.orientation || "landscape";
  openPrintDocument({
    title: `${opts.title || "Export"} — ${stamp}`,
    pageSize: orientation === "landscape" ? "A4-landscape" : "A4",
    bodyHtml: `
      <div class="report-shell">
        <div class="brand-bar">
          <div class="brand-mark">${esc(brandInitials)}</div>
          <div>
            <div class="brand-name">${esc(businessName)}</div>
            ${tagline ? `<div class="brand-tag">${esc(tagline)}</div>` : ""}
          </div>
        </div>
        <div class="meta">
          <div>
            <h1>${esc(opts.title || "Export")}</h1>
            ${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ""}
          </div>
          <div class="stamp">${esc(stamp)}<br/>${matrix.length} row${matrix.length === 1 ? "" : "s"}</div>
        </div>
        ${tableHtml}
        <div class="footer-note">Generated by Dropify · ${esc(businessName)}</div>
      </div>
    `,
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}

/** Convenience: a tiny dropdown-style button component. Render via ExportMenu. */
export interface ExportMenuProps<T> {
  rows: T[];
  cols: ExportColumn<T>[];
  filename: string;
  title?: string;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
  /** Optional className for the trigger button. */
  className?: string;
  /** Optional label override. */
  label?: string;
  /** Business name shown in PDF header and XLSX metadata. */
  businessName?: string;
  /** Brand tagline shown under business name in PDF. */
  tagline?: string;
}
