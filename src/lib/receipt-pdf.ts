import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { Order, Rider, Settings } from "./types";
import { BKASH_NUMBER } from "./bkash-qr";

// Under Next.js bundling, pdfkit's __dirname is webpack-stubbed and it can't
// locate its bundled AFM font files. Resolve them explicitly to the real path.
const PDFKIT_FONT_DIR = path.join(process.cwd(), "node_modules", "pdfkit", "js", "data");
const FONT_REGULAR = path.join(PDFKIT_FONT_DIR, "Courier.afm");
const FONT_BOLD = path.join(PDFKIT_FONT_DIR, "Courier-Bold.afm");

const PAGE_W_MM = 58;
const MARGIN_MM = 2;

// pdfkit uses points; 1 mm = 2.83465 pt
const MM_TO_PT = 2.83465;

export async function buildReceiptPdf(
  order: Order,
  settings: Settings,
  rider: Rider | null,
  outPath: string
): Promise<void> {
  // Estimate height first; pdfkit allows auto-paging but a custom page size
  // works only for the FIRST page. So we estimate line count, set the page
  // height accordingly, and disable auto-paging.
  const lineCount = estimateLineCount(order, settings);
  const pageHeightMm = Math.max(40, lineCount * 2.6 + MARGIN_MM * 2 + 8);
  const w = PAGE_W_MM * MM_TO_PT;
  const h = pageHeightMm * MM_TO_PT;

  const doc = new PDFDocument({
    size: [w, h],
    margins: { top: MARGIN_MM * MM_TO_PT, bottom: MARGIN_MM * MM_TO_PT, left: MARGIN_MM * MM_TO_PT, right: MARGIN_MM * MM_TO_PT },
    autoFirstPage: false,
    font: FONT_REGULAR,
    info: { Title: `Receipt ${order.orderNo}`, Producer: "Dropify" },
  });
  doc.addPage({ size: [w, h], margins: { top: MARGIN_MM * MM_TO_PT, bottom: MARGIN_MM * MM_TO_PT, left: MARGIN_MM * MM_TO_PT, right: MARGIN_MM * MM_TO_PT } });

  const innerW = w - MARGIN_MM * MM_TO_PT * 2;

  // Register fonts explicitly with absolute paths. pdfkit's __dirname is
  // webpack-stubbed inside Next.js, so the default font lookup points at
  // C:\ROOT\node_modules\pdfkit\js\data which doesn't exist.
  doc.registerFont("Receipt", FONT_REGULAR);
  doc.registerFont("Receipt-Bold", FONT_BOLD);
  doc.font("Receipt").fontSize(8);

  const center = (text: string) => doc.text(text, { width: innerW, align: "center" });
  const left = (text: string) => doc.text(text, { width: innerW, align: "left" });
  const sep = (ch = "-") => left(ch.repeat(34));

  center(settings.businessName.toUpperCase());
  if (settings.tagline) center(settings.tagline);
  center(settings.address);
  center(`Tel: ${settings.phone}`);
  sep("=");
  left(`Order: ${order.orderNo}`);
  left(`Date : ${order.date}  ${order.createdAt.slice(11, 16)}`);
  left(`Cust : ${order.customerName}`);
  if (order.customerPhone) left(`Phone: ${order.customerPhone}`);
  if (order.area) left(`Area : ${order.area}`);
  if (order.deliveryMode === "pathao") {
    left(`Del  : Via Pathao`);
    if (order.pathaoTrackingId) left(`       Track: ${order.pathaoTrackingId}`);
  } else if (rider) {
    left(`Del  : ${rider.name}`);
  }
  sep("-");

  for (const it of order.items) {
    left(it.name);
    if (it.nameBn) left(it.nameBn);
    const qtyRate = `${it.qty} ${it.unit} x ${it.unitPrice.toLocaleString("en-IN")}`;
    const amount = it.lineTotal.toLocaleString("en-IN");
    doc.text(qtyRate, MARGIN_MM * MM_TO_PT, doc.y, {
      width: innerW - doc.widthOfString(amount) - 4,
      align: "left",
      continued: true,
    });
    doc.text("  " + amount, { align: "right" });
  }
  sep("-");

  const money = (label: string, value: string) => {
    doc.text(label, MARGIN_MM * MM_TO_PT, doc.y, {
      width: innerW - doc.widthOfString(value) - 4,
      align: "left",
      continued: true,
    });
    doc.text("  " + value, { align: "right" });
  };
  money("Subtotal", order.subtotal.toLocaleString("en-IN"));
  money("Delivery", order.deliveryFee > 0 ? order.deliveryFee.toLocaleString("en-IN") : "FREE");
  if (order.discount > 0) money("Discount", `-${order.discount.toLocaleString("en-IN")}`);
  sep("=");
  doc.font("Receipt-Bold").fontSize(10);
  money("TOTAL", order.total.toLocaleString("en-IN"));
  doc.font("Receipt").fontSize(8);
  money(`Paid (${order.paymentMethod.toUpperCase()})`, order.paid.toLocaleString("en-IN"));
  const due = order.total - order.paid;
  if (due > 0) money("DUE", due.toLocaleString("en-IN"));
  sep("=");
  doc.moveDown(0.5);
  // bKash Payment — uses the static QR image at /public/bkash-qr.png.
  // Embedded directly as a PDF image so it's identical to the image
  // the merchant uploaded (no re-encoding, no EMVCo synthesis).
  try {
    const bkashPath = path.join(process.cwd(), "public", "bkash-qr.png");
    if (fs.existsSync(bkashPath)) {
      const pngBuf = fs.readFileSync(bkashPath);
      // The PNG already has the QR's quiet zone built in. Embed it at full
      // printable width — no extra border, no extra padding.
      const qrWidthPt = (PAGE_W_MM - MARGIN_MM * 2) * MM_TO_PT;
      const qrHeightPt = qrWidthPt * (780 / 612);
      doc.image(pngBuf, (w - qrWidthPt) / 2, doc.y, { width: qrWidthPt, height: qrHeightPt });
      doc.y += qrHeightPt + 4;
    }
  } catch {
    /* skip QR if file missing */
  }
  doc.moveDown(0.5);
  if (settings.invoiceNote) center(settings.invoiceNote);
  center("Thank you!");

  doc.end();
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(outPath);
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.pipe(stream);
  });
}

function estimateLineCount(order: Order, settings: Settings): number {
  let n = 0;
  n += 4; // header (name, tagline, address, phone)
  n += 1; // ====
  n += 4; // order/date/cust/phone
  if (order.area) n++;
  if (order.deliveryMode === "pathao") {
    n += 1;
    if (order.pathaoTrackingId) n++;
  }
  n += 1; // ---
  for (const it of order.items) {
    n += 1; // name
    if (it.nameBn) n += 1;
    n += 1; // qty x rate / amount
  }
  n += 1; // ---
  n += 2; // subtotal/delivery (or 3 with discount)
  if (order.discount > 0) n += 1;
  n += 1; // ===
  n += 1; // TOTAL
  n += 1; // Paid
  if (order.total - order.paid > 0) n += 1; // DUE
  n += 1; // ===
  n += 1; // blank
  n += 24; // QR image space (~54mm portrait)
  if (settings.invoiceNote) n += 1;
  n += 1; // Thank you
  return n;
}