import type { Order, Rider, Settings } from "./types";

const W = 32; // 58mm paper width in chars (typical)

function pad(s: string, len: number, align: "left" | "right" | "center" = "left"): string {
  const t = s.length > len ? s.slice(0, len) : s;
  if (align === "left") return t + " ".repeat(len - t.length);
  if (align === "right") return " ".repeat(len - t.length) + t;
  const padL = Math.floor((len - t.length) / 2);
  const padR = len - t.length - padL;
  return " ".repeat(padL) + t + " ".repeat(padR);
}

function line(ch = "-", len = W): string {
  return ch.repeat(len);
}

function moneyLine(label: string, value: string): string {
  // Right-align value, left-align label, single space between
  const labelLen = Math.min(label.length, W - value.length - 1);
  return label.slice(0, labelLen) + " ".repeat(W - labelLen - value.length) + value;
}

export function buildReceipt(order: Order, settings: Settings, rider: Rider | null): string {
  const lines: string[] = [];
  const W2 = W - 2; // 30 chars inside the box borders

  lines.push(pad(settings.businessName.toUpperCase(), W, "center"));
  if (settings.tagline) lines.push(pad(settings.tagline, W, "center"));
  lines.push(pad(settings.address, W, "center"));
  lines.push(pad(`Tel: ${settings.phone}`, W, "center"));
  lines.push(line("="));

  lines.push(`Order: ${order.orderNo}`);
  lines.push(`Date : ${order.date}  ${order.createdAt.slice(11, 16)}`);
  lines.push(`Cust : ${order.customerName}`);
  if (order.customerPhone) lines.push(`Phone: ${order.customerPhone}`);
  if (order.area) lines.push(`Area : ${order.area}`);
  if (order.deliveryMode === "pathao") {
    lines.push(`Del  : Via Pathao`);
    if (order.pathaoTrackingId) lines.push(`       Track: ${order.pathaoTrackingId}`);
  } else if (rider) {
    lines.push(`Del  : ${rider.name}`);
  }
  lines.push(line("-"));

  // Items table: Item name (multi-line if needed), qty x rate, amount
  for (const it of order.items) {
    const nameLine = it.name.length > W2 ? it.name.slice(0, W2) : it.name;
    lines.push(nameLine);
    const bnLine = it.nameBn && it.nameBn.length <= W2 ? it.nameBn : "";
    if (bnLine) lines.push(bnLine);
    const qtyRate = `${it.qty} ${it.unit} x ${it.unitPrice.toLocaleString("en-IN")}`;
    const amount = `${it.lineTotal.toLocaleString("en-IN")}`;
    const innerLen = W - 1;
    const leftBudget = Math.max(0, innerLen - amount.length);
    const leftTrimmed = qtyRate.slice(0, leftBudget);
    const gap = Math.max(0, innerLen - leftTrimmed.length - amount.length);
    lines.push(leftTrimmed + " ".repeat(gap) + amount);
  }
  lines.push(line("-"));

  lines.push(moneyLine("Subtotal", order.subtotal.toLocaleString("en-IN")));
  const delFee = order.deliveryFee > 0 ? order.deliveryFee.toLocaleString("en-IN") : "FREE";
  lines.push(moneyLine("Delivery", delFee));
  if (order.discount > 0) lines.push(moneyLine("Discount", `-${order.discount.toLocaleString("en-IN")}`));
  lines.push(line("="));
  lines.push(moneyLine("TOTAL", order.total.toLocaleString("en-IN")));
  lines.push(moneyLine(`Paid (${order.paymentMethod.toUpperCase()})`, order.paid.toLocaleString("en-IN")));
  const due = order.total - order.paid;
  if (due > 0) lines.push(moneyLine("DUE", due.toLocaleString("en-IN")));
  lines.push(line("="));
  lines.push("");
  if (settings.invoiceNote) {
    lines.push(pad(settings.invoiceNote, W, "center"));
    lines.push("");
  }
  lines.push(pad("Thank you!", W, "center"));
  lines.push("\n\n\n"); // paper feed + space before cut

  return lines.join("\r\n");
}