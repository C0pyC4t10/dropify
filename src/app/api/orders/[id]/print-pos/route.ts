import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import pdfPrinter from "pdf-to-printer";
import nodeThermal from "node-thermal-printer";
import sharp from "sharp";
import { getOrder, getSettings, getRiders } from "@/lib/db";
import { buildReceiptPng } from "@/lib/receipt-png";

/**
 * Run a CLI and capture its exit status / output. Never throws — always
 * resolves so the caller can log a clean error message and decide what
 * status to return to the browser.
 */
function runCli(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ code: number | null; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: { code: number | null; stdout: string; stderr: string; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    let proc;
    try {
      proc = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      finish({ code: null, stdout: "", stderr: "", error: String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => finish({ code: null, stdout, stderr, error: String(e) }));
    proc.on("exit", (code) => finish({ code, stdout, stderr }));
    if (opts.timeoutMs) {
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* ignore */ }
        finish({ code: null, stdout, stderr, error: "timeout" });
      }, opts.timeoutMs);
    }
  });
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const debugLog: string[] = [];
  const log = (msg: string) => {
    console.log("[print-pos]", msg);
    debugLog.push(msg);
  };

  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    log(`Order ${id} requested`);

    const order = getOrder(id);
    if (!order) {
      log("Order not found");
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const settings = getSettings();
    log(`Settings posPrinterName="${settings.posPrinterName}"`);
    const riders = getRiders();
    const rider = order.riderId ? riders.find((r) => r.id === order.riderId) ?? null : null;

    const pngPath = path.join(os.tmpdir(), `bazarey-receipt-${id}-${Date.now()}.png`);
    log(`Building PNG at ${pngPath}`);
    await buildReceiptPng(order, settings, rider, pngPath, new Date(), { skipQr: true });
    const stat = fs.statSync(pngPath);
    log(`PNG built, ${stat.size} bytes`);

    const printerName = settings.posPrinterName || "Xprinter XP-350BM";
    const isWin = process.platform === "win32";
    log(`Platform=${process.platform}, printer="${printerName}"`);

    if (isWin) {
      log("Using Windows path (pdf-to-printer)");
      // Best-effort: register a 80mm roll paper form on first use so SumatraPDF
      // uses the right paper size. Idempotent.
      await new Promise<void>((resolve) => {
        const ps = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File",
            path.join(process.cwd(), "scripts", "add-printer-form.ps1"),
          ],
          { windowsHide: true }
        );
        ps.on("exit", () => resolve());
        ps.on("error", () => resolve());
      });
      log("Printer form script run (best-effort)");

      const printFn = (pdfPrinter as unknown as { default?: typeof pdfPrinter }).default ?? pdfPrinter;
      try {
        await printFn.print(pngPath, {
          printer: printerName,
          scale: "noscale",
          monochrome: true,
          copies: 1,
        });
        log("pdf-to-printer returned OK");
      } catch (printErr) {
        const msg = String(printErr);
        log(`pdf-to-printer FAILED: ${msg}`);
        try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
        return NextResponse.json(
          {
            error: `Printer call failed: ${msg}`,
            hint: "Printer must be on, spooler running, and name must match Windows Settings → Printers & scanners exactly.",
            printerName,
            debug: debugLog,
          },
          { status: 500 }
        );
      }
    } else {
      log("Using Linux path (TSPL2 direct + ESC/POS fallback)");

      // ---- Detect printer protocol via IEEE 1284 GET_DEVICE_ID ----
      // The XP-350BM reports CMD:TSPL2; ESC/POS printers report ESC/POS.
      // Falls back to TSPL2 if the probe fails (the printer on this
      // machine talks TSPL2 — see scripts/detect-printer-protocol.sh).
      const protocol = await detectPrinterProtocol();
      log(`Printer protocol: ${protocol}`);

      let commandBuffer: Buffer | null = null;
      let protocolUsed = protocol;

      if (protocol === "TSPL2" || protocol === "TSPL") {
        // ---- TSPL2 path (default for Xprinter XP-350BM) ----
        // The XP-350BM is a TSC-clone. We build the receipt with TSPL2
        // TEXT commands directly (printer's native vector font) — its
        // BITMAP rendering of our PNG was producing black-bar artefacts
        // on some firmwares, but TEXT is rock-solid.
        try {
          commandBuffer = buildTsplTextReceipt(order, settings, rider, new Date());
          log(`TSPL2 TEXT stream built: ${commandBuffer.length} bytes`);
        } catch (tErr) {
          log(`TSPL2 TEXT build FAILED: ${String(tErr)}`);
        }
      }

      if (!commandBuffer && protocol === "ESC/POS") {
        // ---- ESC/POS path (real Epson / Star etc.) ----
        const ThermalCtor =
          (nodeThermal as unknown as { ThermalPrinter?: unknown }).ThermalPrinter ?? nodeThermal;
        const PrinterTypes =
          (nodeThermal as unknown as { PrinterTypes?: Record<string, string> }).PrinterTypes ??
          ((ThermalCtor as unknown as { PrinterTypes?: Record<string, string> }).PrinterTypes ?? {});
        try {
          const tp = new (ThermalCtor as new (opts: Record<string, unknown>) => {
            printImage: (filePath: string) => Promise<Buffer>;
            cut: () => void;
            getBuffer: () => Uint8Array;
          })({
            type: PrinterTypes.EPSON ?? "epson",
            width: 48,
            removeSpecialCharacters: false,
          });
          const rasterBytes = await tp.printImage(pngPath);
          if (!rasterBytes || rasterBytes.length === 0) {
            throw new Error("printImage returned empty buffer");
          }
          // Patch node-thermal-printer's invalid GS v 0 mode byte (0x30 → 0x00).
          const fixed = Buffer.from(rasterBytes);
          let patched = 0;
          for (let i = 0; i < fixed.length - 8; i++) {
            if (fixed[i] === 0x1d && fixed[i + 1] === 0x76 && fixed[i + 2] === 0x30) {
              const m = fixed[i + 3];
              if (m !== 0x00 && m !== 0x01 && m !== 0x02 && m !== 0x03) {
                fixed[i + 3] = 0x00;
                patched++;
              }
            }
          }
          commandBuffer = Buffer.concat([
            Buffer.from([0x1b, 0x40]),  // ESC @
            fixed,
            Buffer.from([0x1d, 0x56, 0x00]),  // GS V 0 — full cut
          ]);
          log(`ESC/POS stream built: ${commandBuffer.length} bytes (patched ${patched} headers)`);
        } catch (eErr) {
          log(`ESC/POS generation FAILED: ${String(eErr)}`);
        }
      }

      if (!commandBuffer) {
        try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
        return NextResponse.json(
          {
            error: `Could not build a printer command stream for protocol "${protocol}".`,
            hint: "Only TSPL2 (Xprinter/TSC) and ESC/POS (Epson/Star) are supported on Linux.",
            printerName,
            debug: debugLog,
          },
          { status: 500 }
        );
      }

      // ---- Write to /dev/usb/lp0 directly ----
      // The CUPS queue (if any) was deleted earlier to break the
      // libusb/usblp tug-of-war. usblp owns the device now.
      const devicePath = "/dev/usb/lp0";
      try {
        if (!fs.existsSync(devicePath)) throw new Error(`${devicePath} not present`);
        fs.writeFileSync(devicePath, commandBuffer);
        log(`Wrote ${commandBuffer.length} bytes to ${devicePath} (${protocolUsed})`);
        try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
        return NextResponse.json({
          success: true,
          printerName,
          platform: process.platform,
          protocol: protocolUsed,
          transport: "direct-device",
          debug: debugLog,
        });
      } catch (devErr) {
        log(`Direct ${devicePath} write FAILED: ${String(devErr)} — trying sg lp wrapper`);
      }

      // ---- Fallback: shell out via `sg lp -c` to escalate group ----
      // Works without the dev server itself being in the lp group.
      const cmdPath = path.join(os.tmpdir(), `bazarey-${protocolUsed.toLowerCase()}-${id}-${Date.now()}.bin`);
      fs.writeFileSync(cmdPath, commandBuffer);
      const sg = await runCli("sg", ["lp", "-c", `cat '${cmdPath}' > '${devicePath}' && rm '${cmdPath}'`], { timeoutMs: 15000 });
      try { fs.unlinkSync(cmdPath); } catch { /* ignore */ }
      if (sg.code === 0) {
        log(`sg lp wrapper write OK (${protocolUsed})`);
        try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
        return NextResponse.json({
          success: true,
          printerName,
          platform: process.platform,
          protocol: protocolUsed,
          transport: "sg-lp-wrapper",
          debug: debugLog,
        });
      }
      const detail = (sg.stderr || sg.stdout).trim() || sg.error || `exit ${sg.code}`;
      try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
      return NextResponse.json(
        {
          error: `Direct device and sg wrapper both failed: ${detail}`,
          hint: "Make sure the printer is plugged in, /dev/usb/lp0 exists, and the Bazarey user is in the `lp` group (`sudo usermod -aG lp $USER`, then log out/in).",
          printerName,
          protocol: protocolUsed,
          debug: debugLog,
        },
        { status: 500 }
      );
    }

    try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
    return NextResponse.json({ success: true, printerName, platform: process.platform, debug: debugLog });
  } catch (error) {
    const msg = String(error);
    log(`TOP-LEVEL ERROR: ${msg}`);
    if (error instanceof Error && error.stack) log(`STACK: ${error.stack}`);
    return NextResponse.json(
      { error: `Server error: ${msg}`, hint: "Check server logs.", debug: debugLog },
      { status: 500 }
    );
  }
}

/**
 * Detect the printer's command protocol via IEEE 1284 GET_DEVICE_ID.
 * Shells out to `usb_printerid` because the underlying ioctl is awkward
 * from Node and the tool is in util-linux on most distros.
 *
 * Returns one of: "TSPL2", "TSPL", "ESC/POS", "ZPL", "EPL", "CPCL",
 *                  "UNKNOWN", or "NONE" if no device is reachable.
 */
async function detectPrinterProtocol(): Promise<string> {
  if (!fs.existsSync("/dev/usb/lp0")) return "NONE";
  return await new Promise<string>((resolve) => {
    // usb_printerid needs read access to /dev/usb/lp0 (group `lp`).
    // The dev server usually runs as the user without that group, so
    // escalate via `sg lp -c` — setgid, no password required.
    const proc = spawn("sg", ["lp", "-c", "usb_printerid /dev/usb/lp0"], { windowsHide: true });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", () => resolve("UNKNOWN"));
    proc.on("exit", () => {
      const m = out.match(/CMD:([A-Za-z0-9_/+\-]+)/i) || err.match(/CMD:([A-Za-z0-9_/+\-]+)/i);
      const raw = m ? m[1].toUpperCase() : "UNKNOWN";
      if (raw.includes("TSPL")) resolve("TSPL2");
      else if (raw.includes("ESC") || raw === "POS") resolve("ESC/POS");
      else if (raw.includes("ZPL")) resolve("ZPL");
      else if (raw.includes("EPL")) resolve("EPL");
      else if (raw.includes("CPCL")) resolve("CPCL");
      else resolve(raw);
    });
  });
}

/**
 * Build a TSPL2 command stream using TEXT commands directly. Avoids
 * the XP-350BM's flaky BITMAP rendering of our receipt PNGs.
 *
 * Layout (80mm paper, 640 dots wide @ 203 DPI):
 *   Font 1: 8 × 12 dots      → 80 chars/line    (body)
 *   Font 2: 12 × 20 dots     → 53 chars/line
 *   Font 3: 16 × 24 dots     → 40 chars/line    (headings)
 *   Font 4: 24 × 32 dots     → 26 chars/line    (totals)
 *   Font 5: 32 × 48 dots     → 20 chars/line    (extra-large)
 *
 * "Bold" is faked by printing the same text twice with a 1-dot offset.
 */
function buildTsplTextReceipt(
  order: { orderNo: string; customerName: string; customerPhone?: string; area?: string; address?: string; items: { name: string; qty: number; unit: string; unitPrice: number; lineTotal: number }[]; subtotal: number; deliveryFee: number; discount: number; total: number; paid: number; paymentMethod: string; deliveryMode: string; pathaoTrackingId?: string; confirmedAt?: string; createdAt: string },
  settings: { businessName: string; tagline?: string; address?: string; phone?: string; invoiceNote?: string; deliveryPartners?: { id: string; name: string; phone?: string; website?: string; notes?: string }[]; defaultDeliveryPartnerId?: string },
  rider: { name: string; vehicle: string } | null,
  printedAt: Date = new Date(),
): Buffer {
  const esc = (s: string) => s.replace(/"/g, '""');
  const txt = (text: string, x: number, y: number, font: string, xScale = 1, yScale = 1) =>
    `TEXT ${x},${y},"${font}",0,${xScale},${yScale},"${esc(text)}"\n`;
  const bld = (text: string, x: number, y: number, font: string, xScale = 1, yScale = 1) =>
    txt(text, x, y, font, xScale, yScale) + txt(text, x + 1, y, font, xScale, yScale);

  // Font dimensions in dots (TSPL native, no scale)
  const F = {
    "1": { w: 8, h: 12 },
    "2": { w: 12, h: 20 },
    "3": { w: 16, h: 24 },
    "4": { w: 24, h: 32 },
    "5": { w: 32, h: 48 },
  } as const;
  type FontKey = keyof typeof F;
  const advance = (font: FontKey, scale = 1) => F[font].h * scale + 4;

  // The XP-350BM has 80mm paper but only 72mm (576 dots) effective
  // print width — anything past x=576 is clipped. Position content
  // within the 576-dot band, leave the rest as right margin.
  const PAPER_W = 576;
  const LEFT = 6;
  const RIGHT_PAD = 6;
  let y = 10;
  const parts: string[] = [];

  const l = (text: string, font: FontKey = "1", scale = 1, bold = false) => {
    const cmd = bold ? bld : txt;
    parts.push(cmd(text, LEFT, y, font, scale, scale));
    y += advance(font, scale);
  };
  const c = (text: string, font: FontKey = "1", scale = 1, bold = false) => {
    const w = F[font].w * scale;
    const x = Math.max(0, Math.floor((PAPER_W - text.length * w) / 2));
    const cmd = bold ? bld : txt;
    parts.push(cmd(text, x, y, font, scale, scale));
    y += advance(font, scale);
  };
  // Two-column row with key on left, value right-aligned at the right
  // margin. Trim the key if it would overlap the value.
  const kv = (key: string, value: string, font: FontKey = "1", scale = 1, bold = false) => {
    const w = F[font].w * scale;
    const valX = Math.max(LEFT, PAPER_W - RIGHT_PAD - value.length * w);
    const maxKeyChars = Math.max(0, Math.floor((valX - LEFT - 4) / w));
    const trimmedKey = key.length > maxKeyChars ? key.slice(0, Math.max(0, maxKeyChars - 1)) + "." : key;
    const cmd = bold ? bld : txt;
    parts.push(cmd(trimmedKey, LEFT, y, font, scale, scale));
    parts.push(cmd(value, valX, y, font, scale, scale));
    y += advance(font, scale);
  };
  const sep = (ch = "-") => l(ch.repeat(48));

  parts.push("CLS\n");

  // ---- Header ----
  c(settings.businessName.toUpperCase(), "3", 1, true);
  if (settings.tagline) c(settings.tagline);
  if (settings.address) c(settings.address);
  if (settings.phone) c(`Tel: ${settings.phone}`);
  sep("=");
  c("DELIVERY INVOICE", "3", 1, true);
  sep("=");
  y += 4;

  // ---- Order info ----
  kv("Order #", order.orderNo, "1", 1, true);
  const confirmedDate = (order.confirmedAt ?? order.createdAt).slice(0, 10);
  const confirmedTime = (order.confirmedAt ?? order.createdAt).slice(11, 16);
  kv("Confirmed", `${confirmedDate} ${confirmedTime}`);
  kv("Customer", order.customerName || "-");
  if (order.customerPhone) kv("Phone", order.customerPhone);
  // Full address: area + house/street/landmark if both present, otherwise
  // whichever the order has. ` — ` separates area from the rest.
  const fullAddress = order.area && order.address
    ? `${order.area} — ${order.address}`
    : order.area || order.address || "";
  if (fullAddress) kv("Address", fullAddress);
  let delivery: string;
  if (order.deliveryMode === "pathao") {
    delivery = order.pathaoTrackingId ? `Pathao ${order.pathaoTrackingId}` : "Pathao";
  } else if (rider) {
    delivery = `${rider.name} (${rider.vehicle})`;
  } else {
    delivery = "Unassigned";
  }
  kv("Delivery", delivery);
  sep();
  y += 4;

  // ---- Items ----
  for (const it of order.items) {
    const name = it.name.length > 38 ? it.name.slice(0, 37) + "." : it.name;
    l(name, "1", 1, true);
    kv(`${it.qty} ${it.unit} x ${it.unitPrice.toLocaleString("en-IN")}`, it.lineTotal.toLocaleString("en-IN"));
  }
  sep();
  y += 4;

  // ---- Totals ----
  kv("Subtotal", order.subtotal.toLocaleString("en-IN"));
  kv("Delivery", order.deliveryFee > 0 ? order.deliveryFee.toLocaleString("en-IN") : "FREE");
  if (order.discount > 0) kv("Discount", `-${order.discount.toLocaleString("en-IN")}`);
  sep("=");
  kv("GRAND TOTAL", order.total.toLocaleString("en-IN"), "3", 1, true);
  kv(`Paid (${order.paymentMethod.toUpperCase()})`, order.paid.toLocaleString("en-IN"), "3", 1, true);
  const due = order.total - order.paid;
  if (due > 0) kv("Due", due.toLocaleString("en-IN"), "3", 1, true);
  sep("=");
  // bKash payment instructions — always shown so customers with a Due
  // balance know where to send the money. Number is the merchant
  // account that receives customer "Payment" transfers.
  c("Pay via bKash: 01932367356", "1", 1, true);
  y += 10;

  // ---- Footer ----
  if (settings.invoiceNote) c(settings.invoiceNote);
  c("Thank you!", "2", 1, true);
  const pd = printedAt.toISOString().slice(0, 10);
  const pt = printedAt.toISOString().slice(11, 16);
  c(`Printed: ${pd} ${pt}`);

  // ---- Delivery partner ----
  // Show the default (or the first configured) partner at the bottom —
  // riders and customers see who fulfilled the order. Pulled from
  // Settings.deliveryPartners / .defaultDeliveryPartnerId.
  const partners = settings.deliveryPartners ?? [];
  const partner =
    partners.find((p) => p.id === settings.defaultDeliveryPartnerId) ?? partners[0];
  if (partner) {
    y += 10;
    sep();
    l("Delivered by:", "1", 1, true);
    l(partner.name, "2", 1, true);
    if (partner.phone) l(`Tel: ${partner.phone}`);
    if (partner.website) l(partner.website);
    if (partner.notes) l(partner.notes);
  }

  y += 30; // tail margin so paper feeds past cutter

  // Set the page size to the actual content height so the printer
  // doesn't allocate a fixed 200mm label.
  const heightMm = Math.max(40, Math.ceil(y / 8) + 4);
  parts.unshift(`SIZE 80 mm, ${heightMm} mm\n`);
  parts.push(`REFERENCE 0,0\n`);
  parts.push("PRINT 1\n");

  return Buffer.from(parts.join(""), "ascii");
}