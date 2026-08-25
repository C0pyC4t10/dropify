import sharp from "sharp";
import fs from "fs";
import path from "path";
import type { Order, Rider, Settings } from "./types";
import { BKASH_NUMBER } from "./bkash-qr";

/**
 * 80mm thermal receipt — XP-350BM (80mm paper, 203 DPI native).
 *
 * Compact Font B sizing (ESC/POS native Font B: 9×17 px at 203 DPI):
 *   80mm × 203 DPI = 640 px wide
 *   1mm left + 1mm right margins → effective 624 px
 *   9 px char width → ~52 chars/line at our render size
 *
 * Rendered at compact "minimal" sizes — closer to Font B proportions,
 * which is what professional POS receipts use by default.
 *
 * Sizing (px at 203 DPI):
 *   - Business name bold: 22
 *   - Section title bold: 16
 *   - Body:                14
 *   - Body bold:           15
 *   - Grand total bold:    18
 *   - Footer:              12
 */

const PNG_WIDTH = 640;
const PRINT_X = 8;
const PRINT_RIGHT = PNG_WIDTH - 8;

const FONT_FAMILY = "Courier New, Courier, monospace";

const PX = {
  nameLgBold: 22,
  tagline: 13,
  section: 16,
  body: 14,
  bodyBold: 15,
  total: 18,
  footer: 12,
};

const LH = {
  nameLgBold: 28,
  tagline: 18,
  section: 22,
  body: 20,
  bodyBold: 21,
  total: 24,
  footer: 16,
};

const PADDING_TOP = 6;
const FOOTER_BLANK_LINES = 3;

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Courier is a true monospace font; char width = 0.6 × font-size
function charWpx(fontSize: number): number {
  return fontSize * 0.6;
}

function fit(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  if (maxChars <= 1) return s.slice(0, maxChars);
  return s.slice(0, maxChars - 1) + "…";
}

interface LineOpts {
  bold?: boolean;
  align?: "left" | "center" | "right";
}

function line(
  text: string,
  fontSize: number,
  opts: LineOpts = {}
): { svg: string; lh: number } {
  const cw = charWpx(fontSize);
  let x = PRINT_X;
  if (opts.align === "center") {
    const textW = text.length * cw;
    x = Math.max(PRINT_X, Math.floor(PRINT_X + (PRINT_RIGHT - PRINT_X - textW) / 2));
  } else if (opts.align === "right") {
    const textW = text.length * cw;
    x = Math.max(PRINT_X, PRINT_RIGHT - textW);
  }
  const weight = opts.bold ? ' font-weight="700"' : "";
  const svg = `<text x="${x}" y="0" fill="#000" font-size="${fontSize}"${weight}>${escape(text)}</text>`;
  const lh =
    fontSize >= 20 ? LH.nameLgBold :
    fontSize >= 16 ? LH.section :
    fontSize >= 15 ? LH.bodyBold :
    fontSize >= 14 ? LH.body :
    LH.footer;
  return { svg, lh };
}

function moneyLine(
  label: string,
  value: string,
  opts: { bold?: boolean; fontSize?: number } = {}
): { svg: string; lh: number } {
  const fontSize = opts.fontSize ?? PX.body;
  const cw = charWpx(fontSize);
  const valueW = value.length * cw;
  const valueX = PRINT_RIGHT - valueW;
  const labelMaxChars = Math.max(
    0,
    Math.floor((valueX - PRINT_X - cw) / cw)
  );
  const trimmedLabel = fit(label, labelMaxChars);
  const weight = opts.bold ? ' font-weight="700"' : "";
  const svg =
    `<text x="${PRINT_X}" y="0" fill="#000" font-size="${fontSize}"${weight}>${escape(trimmedLabel)}</text>` +
    `<text x="${valueX}" y="0" fill="#000" font-size="${fontSize}"${weight}>${escape(value)}</text>`;
  return { svg, lh: opts.bold ? LH.bodyBold : LH.body };
}

function twoColLine(
  left: string,
  right: string,
  opts: { leftBold?: boolean; rightBold?: boolean; fontSize?: number } = {}
): { svg: string; lh: number } {
  const fontSize = opts.fontSize ?? PX.body;
  const cw = charWpx(fontSize);
  const rightW = right.length * cw;
  const rightX = PRINT_RIGHT - rightW;
  const leftAttr = opts.leftBold ? ' font-weight="700"' : "";
  const rightAttr = opts.rightBold ? ' font-weight="700"' : "";
  const svg =
    `<text x="${PRINT_X}" y="0" fill="#000" font-size="${fontSize}"${leftAttr}>${escape(left)}</text>` +
    `<text x="${rightX}" y="0" fill="#000" font-size="${fontSize}"${rightAttr}>${escape(right)}</text>`;
  return { svg, lh: LH.body };
}

function sepLine(ch: string, fontSize = PX.body): { svg: string; lh: number } {
  const n = Math.floor((PRINT_RIGHT - PRINT_X) / charWpx(fontSize));
  return {
    svg: `<text x="${PRINT_X}" y="0" fill="#000" font-size="${fontSize}">${ch.repeat(n)}</text>`,
    lh: LH.body,
  };
}

function blankLine(lh: number): { svg: string; lh: number } {
  return { svg: "", lh };
}

/** A QR code block. `qr` is a base64 data URL; `size` is the width/height
 *  of the image in pixels. The renderer below handles embedding the
 *  image in the SVG with the right offsets. */
function qrBlock(dataUrl: string, size: number): { svg: string; lh: number; qr: string; qrSize: number } {
  return { svg: "", lh: size + 12, qr: dataUrl, qrSize: size };
}

export async function buildReceiptPng(
  order: Order,
  settings: Settings,
  rider: Rider | null,
  outPath: string,
  printedAt: Date = new Date()
): Promise<void> {
  const lines: ({ svg: string; lh: number; qr?: string; qrSize?: number })[] = [];

  // ---------- Header ----------
  lines.push(line(settings.businessName.toUpperCase(), PX.nameLgBold, { bold: true, align: "center" }));
  if (settings.tagline) lines.push(line(settings.tagline, PX.tagline, { align: "center" }));
  if (settings.address) lines.push(line(settings.address, PX.tagline, { align: "center" }));
  if (settings.phone) lines.push(line(`Tel: ${settings.phone}`, PX.tagline, { align: "center" }));

  lines.push(sepLine("-", PX.body));
  lines.push(line("DELIVERY INVOICE", PX.section, { bold: true, align: "center" }));
  lines.push(sepLine("-", PX.body));

  // ---------- Order info ----------
  lines.push(twoColLine("Order #", order.orderNo, { rightBold: true }));
  // Confirmation timestamp — when the order was accepted
  const confirmedDate = order.confirmedAt ? order.confirmedAt.slice(0, 10) : order.date;
  const confirmedTime = order.confirmedAt ? order.confirmedAt.slice(11, 16) : order.createdAt.slice(11, 16);
  lines.push(twoColLine("Confirmed", `${confirmedDate} ${confirmedTime}`, { rightBold: true }));
  lines.push(twoColLine("Customer", order.customerName || "-", { leftBold: true }));
  if (order.customerPhone) lines.push(twoColLine("Phone  ", order.customerPhone));
  if (order.area) lines.push(twoColLine("Address", `${order.area}${order.address ? ` — ${order.address}` : ""}`));

  let deliveryStatus: string;
  if (order.deliveryMode === "pathao") {
    deliveryStatus = order.pathaoTrackingId ? `Pathao · ${order.pathaoTrackingId}` : "Pathao";
  } else if (rider) {
    deliveryStatus = `${rider.name} (${rider.vehicle})`;
  } else {
    deliveryStatus = "Unassigned";
  }
  lines.push(twoColLine("Delivery", deliveryStatus));

  lines.push(sepLine("-", PX.body));

  // ---------- Items ----------
  for (const it of order.items) {
    lines.push(line(fit(it.name, 52), PX.body));
    if (it.nameBn) lines.push(line(fit(it.nameBn, 52), PX.tagline));
    lines.push(
      moneyLine(
        `${it.qty} ${it.unit} x ${it.unitPrice.toLocaleString("en-IN")}`,
        it.lineTotal.toLocaleString("en-IN")
      )
    );
  }

  lines.push(sepLine("-", PX.body));

  // ---------- Totals ----------
  lines.push(moneyLine("Subtotal", order.subtotal.toLocaleString("en-IN")));
  lines.push(
    moneyLine("Delivery", order.deliveryFee > 0 ? order.deliveryFee.toLocaleString("en-IN") : "FREE")
  );
  if (order.discount > 0) {
    lines.push(moneyLine("Discount", `-${order.discount.toLocaleString("en-IN")}`));
  }

  lines.push(sepLine("=", PX.body));
  lines.push(
    moneyLine("GRAND TOTAL", order.total.toLocaleString("en-IN"), { bold: true, fontSize: PX.total })
  );

  const due = order.total - order.paid;
  lines.push(
    moneyLine(`Paid (${order.paymentMethod.toUpperCase()})`, order.paid.toLocaleString("en-IN"), {
      bold: true,
      fontSize: PX.bodyBold,
    })
  );
  if (due > 0) {
    lines.push(moneyLine("Due", due.toLocaleString("en-IN"), { bold: true, fontSize: PX.bodyBold }));
  }

  lines.push(sepLine("=", PX.body));

  // ---------- bKash Payment (static QR image) ----------
  // The PNG already has a white background built in (the QR's own quiet
  // zone). We just embed it; no extra borders, no extra padding.
  try {
    const bkashPath = path.join(process.cwd(), "public", "bkash-qr.png");
    if (fs.existsSync(bkashPath)) {
      const buf = fs.readFileSync(bkashPath);
      const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      // Fill the printable width (80mm thermal). QR is 612x780 portrait.
      lines.push(qrBlock(dataUrl, 280));
    }
  } catch {
    /* skip QR if file missing */
  }

  // ---------- Footer ----------
  for (let i = 0; i < FOOTER_BLANK_LINES; i++) lines.push(blankLine(PX.footer));
  if (settings.invoiceNote) lines.push(line(settings.invoiceNote, PX.footer, { align: "center" }));
  lines.push(line("Thank you!", PX.footer, { align: "center" }));
  // Real-time print timestamp — generated at click time
  const printedDate = printedAt.toISOString().slice(0, 10);
  const printedTime = printedAt.toISOString().slice(11, 16);
  lines.push(line(`Printed: ${printedDate} ${printedTime}`, PX.footer, { align: "center" }));

  // ---------- Compose SVG and rasterize ----------
  let y = PADDING_TOP;
  const svgLines = lines
    .map((l) => {
      // QR block: embed a base64 image, centered horizontally.
      if (l.qr) {
        const size = l.qrSize ?? 180;
        const x = Math.max(0, Math.floor((PNG_WIDTH - size) / 2));
        const img = `<image href="${l.qr}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
        y += l.lh;
        return img;
      }
      if (!l.svg) {
        y += l.lh;
        return "";
      }
      const fsMatch = l.svg.match(/font-size="(\d+)"/);
      const fs = fsMatch ? parseInt(fsMatch[1]) : 24;
      const translated = `<g transform="translate(0, ${y + fs})">${l.svg}</g>`;
      y += l.lh;
      return translated;
    })
    .join("");

  const height = y + PADDING_TOP;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PNG_WIDTH}" height="${height}">
    <rect width="100%" height="100%" fill="#fff"/>
    <g font-family="${FONT_FAMILY}" fill="#000">${svgLines}</g>
  </svg>`;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath);
}