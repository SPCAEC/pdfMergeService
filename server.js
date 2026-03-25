const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '25mb' }));

app.post('/render-pdf', async (req, res) => {
  const { html, fileName } = req.body || {};

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Missing html string.' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: ['load', 'domcontentloaded', 'networkidle0']
    });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${fileName || 'document.pdf'}"`
    );
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('render-pdf failed', err);
    return res.status(500).json({
      error: 'PDF render failed',
      detail: String(err && err.message ? err.message : err)
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`PDF render service listening on port ${port}`);
});
