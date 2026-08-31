import { normalizePhone } from "./phone";
import type { PaymentMethod } from "./types";

/**
 * Output of the heuristic order-text parser. All fields are inferred; the UI
 * lets operators edit before submitting.
 */
export interface ParsedOrder {
  customerName: string;
  customerPhone: string; // canonicalized BD form
  phoneRaw: string;
  area: string;
  address: string;
  paymentMethod: PaymentMethod;
  shippingMode: "inside_dhaka" | "outside_dhaka" | "";
  items: ParsedOrderItem[];
  note: string;
  totalHint: number | null; // raw total found in text (e.g. "৳1,790.00")
  /** Sum of items×qty + delivery, computed from item list — used for cross-check. */
  computedTotal: number;
  /** Confidence per field: 0..1. Below 0.5 → flag for review. */
  confidence: Record<ParsedField, number>;
}

export type ParsedField =
  | "customerName"
  | "customerPhone"
  | "area"
  | "address"
  | "paymentMethod"
  | "shippingMode"
  | "items"
  | "totalHint";

export interface ParsedOrderItem {
  /** Best-guess product name from the message line. May include emoji. */
  nameHint: string;
  /** Quantity like 2 (kg), 1 (pcs). Stored separately from unit. */
  quantity: number;
  /** Unit price (per kg or per pc). NOT line total — compute lineTotal = qty*unitPrice. */
  unitPrice: number;
  /** Inferred unit (kg/pcs). Defaults to "kg". */
  unit: "kg" | "pcs";
  /** Resolved product id from our DB if matched; null otherwise. */
  matchedProductId: number | null;
  /** Confidence this line is a real line item (not header/noise). */
  confidence: number;
  /** Computed line total (qty × unitPrice) — for UI summary only. */
  lineTotal: number;
}

export interface ParseInput {
  text: string;
  products: {
    id: number;
    name: string;
    nameBn: string;
    sku: string;
    sellPrice: number;
    unit: string;
  }[];
}

// ────────────────────────────── keyword tables ──────────────────────────────

const PAYMENT_KEYWORDS: Array<{ keys: string[]; method: PaymentMethod; weight?: number }> = [
  { keys: ["cash on delivery", "ক্যাশ অন ডেলিভারি", "ক্যাশ"], method: "cod" },
  { keys: ["bksh", "bikash", "বিকাশ"], method: "bkash" },
  { keys: ["nagad", "নগদ"], method: "nagad" },
  { keys: ["rocket", "রকেট"], method: "card" },
  { keys: ["card", "কার্ড", "বিকাশ"], method: "card", weight: 0.5 },
  { keys: ["advance", "অগ্রিম"], method: "advance" },
];

const SHIPPING_KEYWORDS = [
  { keys: ["inside dhaka", "ইনসাইড ঢাকা", "ঢাকার ভিতরে", "ঢাকার ভিতর", "ইনসাইড"], mode: "inside_dhaka" as const },
  { keys: ["outside dhaka", "আউটসাইড ঢাকা", "ঢাকার বাইরে", "ঢাকার বাহিরে", "আউটসাইড"], mode: "outside_dhaka" as const },
];

const AREA_KEYWORDS = [
  "Uttara", "Dhanmondi", "Mirpur", "Banani", "Gulshan", "Mohammadpur",
  "Bashundhara", "Rampura", "Tejgaon", "Khilgaon", "Lalmatia",
  "Baridhara", "Wari", "Old Dhaka",
  "উত্তরা", "ধানমন্ডি", "মিরপুর", "বনানী", "গুলশান", "মোহাম্মদপুর",
  "বসুন্ধরা", "রামপুরা", "তেজগাঁও", "খিলগাঁও", "বাড্ডা", "বারিধারা",
];

// Phone regexes — match plain 017XX, +88017XX, +88 017XX, with spaces/dashes.
const PHONE_REGEXES = [
  /(?:\+?88[\s\-]?)?01[3-9]\d{2}[\s\-]?\d{3}[\s\-]?\d{3}\b/, // spaced/dashed, mandatory 11 digits
  /(?:\+?88[\s\-]?)?01[3-9]\d{8}\b/,                              // plain or prefix, no separators
];

// Bangla address keywords — when any of these appear in a line, it
// strongly suggests that line is part of the address block.
const BANGLA_ADDRESS_KEYWORDS = [
  "ঠিকানা", "বাসা", "বাড়ি", "বাড়ী", "ফ্ল্যাট", "ফ্লাট",
  "রোড", "রাস্তা", "গলি", "এলাকা", "বাড়ি", "হোল্ডিং",
  "ঢাকা", "সিটি", "টাউন", "গ্রাম", "ইউনিয়ন",
];

/** A line that LOOKS LIKE a label, never an address/name. */
const labelRe = /^(?:phone|phone\s*no\.?|মোবাইল|মোবাইল\s*নাম্বার|payment|payment\s*(?:via|method)?|shipping|shipping\s*(?:method|details)?|product|product\s*name|qty|quantity|item|items|note|notes|delivery|address\s*details|order\s*details|ঠিকানা|billing|package|completed|edit|sub\s*total|total|shipping\s*cost|tax)/i;

/** A line that is just a quantity with a unit (no price). "3KG", "1 kg", "5 পিস". */
const QTY_ONLY_RE = /^\s*\d+(?:\.\d+)?\s*(kg|কেজি|pcs|pc|পিস|piece|pieces|টুকরা)\s*$/i;

function looksLikeQtyTimesPriceLine(ln: string): { qty: number; lineTotal: number; unit: "kg" | "pcs" } | null {
  // Accepts commas, tabs, spaces, "x" or "×" as qty↔price separators.
  let m = ln.match(/^\s*(\d+(?:\.\d+)?)\s*(?:kg|pcs|pc|piece|pieces|কেজি|পিস|টুকরা|কেজি\s*[\d]*)?\s*[,\t ×x]+\s*([\d,]+(?:\.\d+)?)\s*(?:৳|taka|tk|bdt|টাকা)?\s*$/i);
  if (!m) {
    m = ln.match(/^(?:৳|taka|tk|bdt|টাকা)?\s*([\d,]+(?:\.\d+)?)\s*(?:৳|taka|tk|bdt|টাকা)?\s*$/i);
    if (m && /৳|taka|tk|bdt|টাকা/i.test(ln)) {
      const total = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(total) && total > 0) return { qty: 1, lineTotal: total, unit: "kg" };
    }
    return null;
  }
  const qty = Number(m[1]);
  const total = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!Number.isFinite(total) || total <= 0) return null;
  let unit: "kg" | "pcs" = "kg";
  if (/pcs|pc|piece|pieces|পিস/i.test(ln)) unit = "pcs";
  return { qty, lineTotal: total, unit };
}

function looksLikePriceLine(ln: string): boolean {
  return /৳/.test(ln) || looksLikeQtyTimesPriceLine(ln) !== null;
}

function looksLikePhoneOnly(ln: string): boolean {
  const stripped = ln.replace(/[\s\-()+]/g, "");
  return /^01[3-9]\d{8}$/.test(stripped);
}

function findPhone(text: string): string | null {
  for (const ln of text.split(/\r?\n/)) {
    for (const re of PHONE_REGEXES) {
      const m = ln.match(re);
      if (m) return m[0].replace(/[\s\-()+]/g, "");
    }
  }
  return null;
}

function findPayment(text: string): PaymentMethod | null {
  const lower = text.toLowerCase();
  let best: { method: PaymentMethod; priority: number } | null = null;
  for (const p of PAYMENT_KEYWORDS) {
    if (p.keys.some((k) => lower.includes(k))) {
      const priority = p.weight ?? 1;
      if (!best || priority > best.priority) best = { method: p.method, priority };
    }
  }
  return best?.method ?? null;
}

function findShipping(text: string): "inside_dhaka" | "outside_dhaka" | null {
  const lower = text.toLowerCase();
  for (const s of SHIPPING_KEYWORDS) {
    if (s.keys.some((k) => lower.includes(k))) return s.mode;
  }
  return null;
}

function findArea(text: string): string | null {
  const labelAreaMatch = text.match(/^\s*area\s*[:\-]\s*(.+)$/im);
  if (labelAreaMatch) return labelAreaMatch[1].trim();

  // Case-insensitive earliest-match: pick the area keyword that appears first
  // in the text rather than the first one in AREA_KEYWORDS that matches.
  // Returns the canonical-case form from AREA_KEYWORDS so the dropdown shows
  // the same spelling the form expects ("Mirpur", not "mirpur").
  const lower = text.toLowerCase();
  let earliest: { kw: string; pos: number } | null = null;
  for (const kw of AREA_KEYWORDS) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx === -1) continue;
    if (earliest === null || idx < earliest.pos) {
      earliest = { kw, pos: idx };
    }
  }
  return earliest?.kw ?? null;
}

function findTotal(text: string): number | null {
  let total: number | null = null;
  const re = /৳\s?([\d,]+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(v) && v > 0 && (total === null || v > total)) total = v;
  }
  return total;
}

interface RawParsedItem {
  qty: number;
  unit: "kg" | "pcs";
  unitPrice: number;
  lineTotal: number;
  nameHint: string;
  sourceLine: string;
}

/**
 * Walk backwards from `atLine` looking for the real product-name line. Skips
 * labels ("Package:", "Completed:"…), qty-only lines ("3KG"), qty×price lines,
 * price-only lines, and blanks. Returns the trimmed candidate or "".
 */
function findNameAbove(lines: string[], atLine: number): string {
  for (let j = atLine - 1; j >= 0; j--) {
    const prev = lines[j];
    if (!prev) continue;
    if (labelRe.test(prev)) continue;
    if (looksLikeQtyTimesPriceLine(prev)) continue;
    if (looksLikePriceLine(prev) && /^\d/.test(prev)) continue;
    if (QTY_ONLY_RE.test(prev)) continue;
    return prev;
  }
  return "";
}

/**
 * Parse items from the lines. The strategy is:
 *   1. Mark each line as either a "name" line or a "qty×price" line by looking
 *      for the qty×price pattern, the qty-only pattern ("1 কেজি"), the
 *      ৳-price-only pattern, or kg/pcs unit markers.
 *   2. If a qty-only line ("3KG") is immediately followed by a qty×price line
 *      ("\t1\t2,685.00৳") — within 2 lines — they describe the SAME product:
 *      the qtyOnly carries the real quantity, the qtyPrice carries the line
 *      total. Merge them into one item so we don't double-count.
 *   3. Pair each item with the product-name line right above it, skipping
 *      labels and other item-shaped lines so the name lands on the real
 *      product header (e.g. "🐐 দেশি ছাগলের মাংস - 3KG").
 *   4. Drop duplicates by (qty, lineTotal, nameHint).
 */
function parseItems(text: string): RawParsedItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  type ItemLike =
    | { kind: "qtyprice"; qty: number; lineTotal: number; unit: "kg" | "pcs"; atLine: number }
    | { kind: "qtyOnly"; qty: number; unit: "kg" | "pcs"; atLine: number };
  const items: ItemLike[] = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const qp = looksLikeQtyTimesPriceLine(ln);
    if (qp) {
      items.push({ kind: "qtyprice", qty: qp.qty, lineTotal: qp.lineTotal, unit: qp.unit, atLine: i });
      continue;
    }
    if (QTY_ONLY_RE.test(ln)) {
      const m = ln.match(/^\s*(\d+(?:\.\d+)?)\s*(kg|কেজি|pcs|pc|পিস|piece|pieces|টুকরা)\s*$/i);
      if (m) {
        const unit = /pcs|pc|পিস|piece/i.test(m[2]) ? "pcs" : "kg";
        items.push({ kind: "qtyOnly", qty: Number(m[1]), unit, atLine: i });
      }
    }
  }

  // Step 2: merge qtyOnly+qtyprice that describe the same product.
  const result: RawParsedItem[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (consumed.has(i)) continue;
    const it = items[i];

    if (it.kind === "qtyOnly") {
      // Look ahead for a qtyprice within 2 lines of the qtyOnly.
      let mergeIdx = -1;
      for (let j = i + 1; j < items.length; j++) {
        if (consumed.has(j)) continue;
        const other = items[j];
        if (other.atLine - it.atLine > 2) break;
        if (other.kind === "qtyprice") {
          mergeIdx = j;
          break;
        }
      }
      if (mergeIdx >= 0) {
        const qp = items[mergeIdx] as Extract<ItemLike, { kind: "qtyprice" }>;
        // The qtyOnly's quantity is the real quantity (the qtyPrice's "1" is
        // the "row index" the customer pasted, not the amount).
        const qty = it.qty;
        const lineTotal = qp.lineTotal;
        const unitPrice = qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : qp.lineTotal;
        const name = findNameAbove(lines, it.atLine);
        result.push({
          qty,
          unit: it.unit,
          unitPrice,
          lineTotal,
          nameHint: name || `Item ${it.atLine}`,
          sourceLine: lines[it.atLine],
        });
        consumed.add(i);
        consumed.add(mergeIdx);
        continue;
      }
      // No qtyprice follows within 2 lines — emit qtyOnly as-is (price will be
      // filled from the catalog by the caller).
      const name = findNameAbove(lines, it.atLine);
      result.push({
        qty: it.qty,
        unit: it.unit,
        unitPrice: 0,
        lineTotal: 0,
        nameHint: name || `Item ${it.atLine}`,
        sourceLine: lines[it.atLine],
      });
      consumed.add(i);
      continue;
    }

    // Plain qtyprice with no preceding qtyOnly.
    const name = findNameAbove(lines, it.atLine);
    const unitPrice = Math.round((it.lineTotal / it.qty) * 100) / 100;
    result.push({
      qty: it.qty,
      unit: it.unit,
      unitPrice,
      lineTotal: it.lineTotal,
      nameHint: name || `Item ${it.atLine}`,
      sourceLine: lines[it.atLine],
    });
    consumed.add(i);
  }

  // De-dupe by (qty, lineTotal, nameHint). Drop unitPrice from the key — it's
  // derived from the other two and a rounding difference would otherwise let
  // duplicates through.
  const seen = new Set<string>();
  return result.filter((it) => {
    const key = `${it.qty}|${it.lineTotal}|${it.nameHint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Match a name hint (typically "দেশি ছাগলের মাংস — ১ কেজি" or "Deshi Mutton")
 * against our product catalog. Normalizes whitespace + case so "দেশি ছাগলের  মাংস"
 * (double space) matches "দেশি ছাগলের মাংস" (single space).
 */
function matchProduct(
  hint: string,
  products: ParseInput["products"]
): ParseInput["products"][number] | null {
  if (!hint || hint.length < 2) return null;

  // Strip tails like "— ১ কেজি" or "(1 kg)".
  const cleaned = hint
    .replace(/[—–-]\s*[\d০-৯]+\s*(kg|pcs|pc|কেজি|পিস).*$/i, "")
    .replace(/\s+\(.+?\)\s*$/, "")
    .trim();
  const normHint = cleaned.replace(/\s+/g, " ").toLowerCase();
  if (normHint.length < 2) return null;

  // 1) Exact substring match — prefer the LONGEST product name that fits AND
  //    has at least one matching word-boundary. Avoids the "Deshi Beef"
  //    matching "DESHI-MUTTON" bug.
  type Candidate = { p: ParseInput["products"][number]; len: number; isExact: boolean };
  let best: Candidate | null = null;
  for (const p of products) {
    for (const field of [p.name, p.nameBn]) {
      if (!field) continue;
      const norm = field.replace(/\s+/g, " ").toLowerCase();
      if (!norm) continue;
      if (!normHint.includes(norm)) continue;
      const at = normHint.indexOf(norm);
      const prevChar = at === 0 ? " " : normHint[at - 1];
      const isExactStart = prevChar === " " || prevChar === "," || prevChar === "(";
      const candidate: Candidate = { p, len: norm.length, isExact: isExactStart };
      if (
        !best ||
        (candidate.isExact && !best.isExact) ||
        (candidate.isExact === best.isExact && candidate.len > best.len)
      ) {
        best = candidate;
      }
    }
  }
  if (best) return best.p;

  // 2) Token-level fallback.
  const hintTokens = normHint.split(/[\s,()]+/).filter((t) => t.length >= 3);
  for (const tok of hintTokens) {
    let tokenBest: Candidate | null = null;
    for (const p of products) {
      for (const field of [p.name, p.nameBn]) {
        if (!field) continue;
        const norm = field.replace(/\s+/g, " ").toLowerCase();
        const normTokens = norm.split(/\s+/);
        if (normTokens.includes(tok)) {
          const candidate: Candidate = { p, len: norm.length, isExact: tok === norm };
          if (
            !tokenBest ||
            (candidate.isExact && !tokenBest.isExact) ||
            (candidate.isExact === tokenBest.isExact && candidate.len > tokenBest.len)
          ) {
            tokenBest = candidate;
          }
        }
      }
    }
    if (tokenBest) return tokenBest.p;
  }
  return null;
}

/**
 * Find customer name + address. Handles ASCII, full-width (，) and
 * Bangla-only address lines. Strategy:
 *   1. An "address line" is one that contains a comma (ASCII or ！)
 *      OR a Bangla address keyword, AND is not a label/phone/item.
 *   2. Address block = one or more consecutive address lines.
 *   3. Name = line just above the block, or first non-label/non-address
 *      line elsewhere.
 */
function findNameAndAddress(text: string, lines: string[]): {
  name: string;
  address: string;
  nameConfidence: number;
  addressConfidence: number;
} {
  // Strip leading "ঠিকানা" / "Address:" label (handles em-dash, en-dash,
  // hyphen, colon) so the line content can be matched.
  const cleaned = lines.map((l) =>
    l.replace(/^\s*(?:ঠিকানা|address)\s*[:\-—–]?\s*/i, "")
  );

  // Is this line part of an address block? Heuristics:
  //   - Contains ASCII or full-width comma, OR
  //   - Contains a Bangla address keyword (ঠিকানা, বাসা, রোড…)
  //   - AND not a label, not a phone, not a price line, not pure number
  //     not a payment/shipping line.
  const isAddressLine = (ln: string): boolean => {
    if (!ln || ln.length < 4) return false;
    if (labelRe.test(ln)) return false;
    if (looksLikePhoneOnly(ln)) return false;
    if (looksLikeQtyTimesPriceLine(ln)) return false;
    if (/৳/.test(ln)) return false;
    if (/^[\d.,\s]+$/.test(ln)) return false;
    if (AREA_KEYWORDS.includes(ln.trim())) return false;
    const hasComma = /,|，/.test(ln);
    const hasKw = BANGLA_ADDRESS_KEYWORDS.some((k) => ln.includes(k));
    return hasComma || hasKw;
  };

  // 1) Find the address block — first run of consecutive address-like lines.
  //    (We take the first block; multi-block joining is a future enhancement.)
  let blockStart = -1;
  let blockEnd = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (isAddressLine(cleaned[i])) {
      blockStart = i;
      blockEnd = i;
      while (blockEnd + 1 < cleaned.length && isAddressLine(cleaned[blockEnd + 1])) {
        blockEnd++;
      }
      break;
    }
  }

  // 2) Find the name line — the line just above the address block, or the
  //    first non-label/non-item/non-address line elsewhere.
  let name = "";
  if (blockStart > 0) {
    const candidate = cleaned[blockStart - 1];
    if (
      candidate &&
      !labelRe.test(candidate) &&
      !looksLikePhoneOnly(candidate) &&
      !isAddressLine(candidate)
    ) {
      name = candidate;
    }
  }
  if (!name) {
    for (const ln of cleaned) {
      if (!ln) continue;
      if (labelRe.test(ln)) continue;
      if (looksLikePhoneOnly(ln)) continue;
      if (looksLikeQtyTimesPriceLine(ln)) continue;
      if (/^[\d.,\s]+$/.test(ln)) continue;
      if (/৳/.test(ln)) continue;
      if (AREA_KEYWORDS.includes(ln.trim())) continue;
      if (isAddressLine(ln)) continue;
      name = ln;
      break;
    }
  }

  const address = blockStart >= 0 ? cleaned.slice(blockStart, blockEnd + 1).join(", ") : "";

  return {
    name,
    address,
    nameConfidence: name ? (address ? 0.9 : 0.6) : 0,
    addressConfidence: address ? 0.88 : 0,
  };
}

// ────────────────────────────── entry point ──────────────────────────────

export function parseOrderFromText(input: ParseInput): ParsedOrder {
  const text = input.text || "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Result skeleton.
  const result: ParsedOrder = {
    customerName: "",
    customerPhone: "",
    phoneRaw: "",
    area: "",
    address: "",
    paymentMethod: "cod",
    shippingMode: "",
    items: [],
    note: "",
    totalHint: null,
    computedTotal: 0,
    confidence: {
      customerName: 0,
      customerPhone: 0,
      area: 0,
      address: 0,
      paymentMethod: 0,
      shippingMode: 0,
      items: 0,
      totalHint: 0,
    },
  };

  if (!lines.length) return result;

  // ── 1. Customer name + address (must run before phone check to skip phone-only lines)
  const na = findNameAndAddress(text, lines);
  result.customerName = na.name;
  result.address = na.address;
  result.confidence.customerName = na.nameConfidence;
  result.confidence.address = na.addressConfidence;

  // ── 2. Phone
  const phoneRaw = findPhone(text);
  if (phoneRaw) {
    result.phoneRaw = phoneRaw;
    result.customerPhone = normalizePhone(phoneRaw);
    result.confidence.customerPhone = 0.95;
  }

  // ── 3. Area
  const area = findArea(text);
  if (area) {
    result.area = area;
    result.confidence.area = 0.92;
  }

  // ── 4. Payment
  const payment = findPayment(text);
  if (payment) {
    result.paymentMethod = payment;
    result.confidence.paymentMethod = 0.9;
  }

  // ── 5. Shipping
  const shipping = findShipping(text);
  if (shipping) {
    result.shippingMode = shipping;
    result.confidence.shippingMode = 0.92;
  }

  // ── 6. Items + total hint
  const rawItems = parseItems(text);
  for (const raw of rawItems) {
    const matched = matchProduct(raw.nameHint, input.products);
    // If we matched a product AND we don't have a price from the message, fall
    // back to the product's sellPrice so the order line gets a price.
    const unitPrice =
      raw.unitPrice > 0
        ? raw.unitPrice
        : matched?.sellPrice ?? 0;
    const lineTotal = Math.round(unitPrice * raw.qty * 100) / 100;
    result.items.push({
      nameHint: raw.nameHint,
      quantity: raw.qty,
      unit: raw.unit,
      unitPrice: Math.round(unitPrice * 100) / 100,
      matchedProductId: matched?.id ?? null,
      confidence: matched ? 0.85 : 0.4,
      lineTotal,
    });
  }
  if (result.items.length > 0) result.confidence.items = 0.7;

  // ── 7. Total hint (largest ৳-suffixed number)
  result.totalHint = findTotal(text);

  // ── 8. Computed total (items × qty + delivery if shipping detected)
  const deliveryFee = result.shippingMode === "inside_dhaka" ? 100 : result.shippingMode === "outside_dhaka" ? 150 : 0;
  const itemsSum = result.items.reduce((s, it) => s + it.lineTotal, 0);
  result.computedTotal = itemsSum + deliveryFee;
  if (result.totalHint && deliveryFee > 0 && Math.abs(result.totalHint - result.computedTotal) < 5) {
    // Total hint matches sum+delivery → high confidence.
    result.confidence.totalHint = 0.98;
  } else if (result.totalHint) {
    // Otherwise, distinguish sum vs hint total in UI.
    result.confidence.totalHint = 0.85;
  }

  return result;
}
