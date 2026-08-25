// Diagnostic: try the same pdf-to-printer call the API makes
const pdfPrinter = require("pdf-to-printer");
const fs = require("fs");
const path = require("path");
const os = require("os");

(async () => {
  try {
    // Make a tiny valid PDF
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: [58 * 2.83465, 100 * 2.83465], autoFirstPage: false });
    doc.addPage({ size: [58 * 2.83465, 100 * 2.83465] });
    doc.fontSize(10).text("Hello from Bazarey PDF printer test!", { align: "center" });
    doc.end();
    const tmp = path.join(os.tmpdir(), "bazarey-test.pdf");
    const stream = fs.createWriteStream(tmp);
    doc.pipe(stream);
    await new Promise((res) => stream.on("finish", res));
    console.log("PDF written to:", tmp, "size:", fs.statSync(tmp).size);

    // Print it
    const printFn = pdfPrinter.default || pdfPrinter;
    console.log("Calling pdf-to-printer.print...");
    await printFn.print(tmp, { printer: "Xprinter XP-350BM" });
    console.log("Print call succeeded!");
  } catch (e) {
    console.error("FAILED:", e.message);
    console.error(e.stack);
  }
})();