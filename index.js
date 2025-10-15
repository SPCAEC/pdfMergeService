import express from "express";
import cors from "cors";
import { PDFDocument } from "pdf-lib";

const app = express();
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

app.get("/", (req, res) => {
  res.send("✅ PDF Merge Service is running");
});

app.post("/merge", async (req, res) => {
  try {
    const { outputName, files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    console.log(`Merging ${files.length} PDFs...`);

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      if (!file || !file.contentBase64) {
        console.warn("Skipping file with missing base64 content:", file?.name);
        continue;
      }

      const pdfBytes = Buffer.from(file.contentBase64, "base64");
      const srcPdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const mergedBase64 = Buffer.from(mergedBytes).toString("base64");

    res.json({
      fileName: outputName || "merged.pdf",
      contentBase64: mergedBase64,
      status: "ok",
    });
  } catch (err) {
    console.error("Merge error:", err);
    res.status(500).json({ error: "Error merging PDFs", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 PDF Merge Service running on port ${PORT}`));