"use client";

/**
 * Open a new browser window with a print-ready styled HTML document and
 * auto-trigger window.print(). The user gets a real PDF via the browser's
 * "Save as PDF" option — with perfect Bengali rendering (the OS font
 * shaper handles conjuncts that jsPDF cannot).
 */
export function openPrintDocument(opts: {
  title: string;
  bodyHtml: string;
  pageSize?: "A4" | "A4-landscape" | "Letter" | "Letter-landscape";
}): void {
  const w = window.open("", "_blank", "width=1300,height=900");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups for this site to export PDFs.");
    return;
  }
  const sizeCss = pageSizeCss(opts.pageSize ?? "A4");
  w.document.open();
  w.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(opts.title)}</title>
<style>${sizeCss}
  @page { size: ${opts.pageSize ?? "A4"}; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', 'Noto Sans Bengali', 'Hind Siliguri', 'Kalpurush',
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #111;
    background: #fff;
    font-size: 12px;
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }
  .brand-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    background: linear-gradient(135deg, #1f6b3a 0%, #2d8a4e 100%);
    color: #fff;
    border-radius: 8px 8px 0 0;
  }
  .brand-mark {
    width: 38px; height: 38px;
    border-radius: 8px;
    background: rgba(255,255,255,0.16);
    display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 16px; letter-spacing: -0.02em;
    border: 1px solid rgba(255,255,255,0.25);
  }
  .brand-name { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
  .brand-tag { font-size: 11px; opacity: 0.85; margin-top: 2px; }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 12px 18px 6px;
    border-bottom: 1px solid #eee;
  }
  .meta h1 { margin: 0; font-size: 18px; font-weight: 700; color: #111; }
  .meta .sub { font-size: 11px; color: #777; margin-top: 3px; }
  .meta .stamp { font-size: 11px; color: #555; text-align: right; }
  table.report {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 18px;
    font-variant-numeric: tabular-nums;
  }
  table.report thead th {
    background: #f4f5f7;
    color: #333;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 10px 12px;
    text-align: left;
    border-bottom: 2px solid #1f6b3a;
    white-space: nowrap;
  }
  table.report thead th.num { text-align: right; }
  table.report tbody td {
    padding: 9px 12px;
    border-bottom: 1px solid #eee;
    font-size: 12px;
    vertical-align: top;
  }
  table.report tbody td.num { text-align: right; white-space: nowrap; }
  table.report tbody tr:nth-child(even) td { background: #fafbfc; }
  table.report tbody tr:hover td { background: #f0f7f1; }
  table.report tfoot td {
    padding: 11px 12px;
    background: #1f6b3a;
    color: #fff;
    font-weight: 700;
    font-size: 12px;
    border-top: 2px solid #1f6b3a;
  }
  table.report tfoot td.num { text-align: right; }
  .footer-note {
    padding: 8px 18px 16px;
    font-size: 10px;
    color: #888;
    text-align: center;
    border-top: 1px dashed #e2e2e2;
  }
  .empty {
    padding: 60px 18px;
    text-align: center;
    color: #888;
    font-style: italic;
  }
  @media print {
    html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
    body { font-size: 11px; }
    .report-shell {
      max-width: none !important;
      width: 100%;
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    .brand-bar { border-radius: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table.report { margin: 14px 0; }
    table.report thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table.report tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table.report tfoot td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 8mm; }
  }
</style></head><body>${opts.bodyHtml}</body></html>`);
  w.document.close();
  // Wait for layout to settle, then trigger print.
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* user dismissed */
    }
  };
  if (w.document.readyState === "complete") {
    setTimeout(trigger, 250);
  } else {
    w.addEventListener("load", () => setTimeout(trigger, 250), { once: true });
  }
}

function pageSizeCss(size: "A4" | "A4-landscape" | "Letter" | "Letter-landscape"): string {
  const base = "body { padding: 0; }";
  if (size === "A4-landscape" || size === "Letter-landscape") {
    return `${base} @media screen { body { background: #f3f4f6; padding: 20px; } .report-shell { max-width: 1260px; margin: 0 auto; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-radius: 8px; overflow: hidden; } }`;
  }
  return `${base} @media screen { body { background: #f3f4f6; padding: 20px; } .report-shell { max-width: 900px; margin: 0 auto; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-radius: 8px; overflow: hidden; } }`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}