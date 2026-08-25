import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import pdfPrinter from "pdf-to-printer";
import { getOrder, getSettings, getRiders } from "@/lib/db";
import { buildReceiptPng } from "@/lib/receipt-png";

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
    await buildReceiptPng(order, settings, rider, pngPath);
    const stat = fs.statSync(pngPath);
    log(`PNG built, ${stat.size} bytes`);

    const printerName = settings.posPrinterName || "Xprinter XP-350BM";
    log(`Calling pdf-to-printer for "${printerName}"`);

    // Best-effort: register a 80mm roll paper form on first use so SumatraPDF
    // uses the right paper size. Idempotent.
    try {
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
    } catch {
      log("Printer form script could not run; continuing");
    }

    const printFn = (pdfPrinter as unknown as { default?: typeof pdfPrinter }).default ?? pdfPrinter;
    try {
      // Force 1:1 rendering at the image's native pixel size; thermal printers
      // are monochrome so always render B/W.
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

    try { fs.unlinkSync(pngPath); } catch { /* ignore */ }
    return NextResponse.json({ success: true, printerName, debug: debugLog });
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