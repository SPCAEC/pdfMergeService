'use strict';

/**
 * server.js
 * ----------
 * Minimal HTML -> PDF render service for SPCA Pantry batch/forms.
 *
 * Contract:
 *   POST /render-pdf
 *   Headers:
 *     Content-Type: application/json
 *     Authorization: Bearer <RENDER_API_KEY>   // optional if env var set
 *
 *   Body:
 *     {
 *       "html": "<!doctype html>...</html>",
 *       "fileName": "PantryBatch_BATCH_20260325_123456.pdf" // optional
 *     }
 *
 *   Response:
 *     200 application/pdf (raw PDF bytes)
 *
 * Environment variables:
 *   PORT=3000
 *   RENDER_API_KEY=your-secret-token          // optional but recommended
 *   MAX_JSON_MB=25                            // optional
 *   PUPPETEER_TIMEOUT_MS=30000                // optional
 *   ALLOW_HEALTH_WITHOUT_AUTH=true            // optional, default true
 */

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const RENDER_API_KEY = String(process.env.RENDER_API_KEY || '').trim();
const MAX_JSON_MB = Number(process.env.MAX_JSON_MB || 25);
const PUPPETEER_TIMEOUT_MS = Number(process.env.PUPPETEER_TIMEOUT_MS || 30000);
const ALLOW_HEALTH_WITHOUT_AUTH =
  String(process.env.ALLOW_HEALTH_WITHOUT_AUTH || 'true').toLowerCase() === 'true';

app.disable('x-powered-by');
app.use(express.json({ limit: `${MAX_JSON_MB}mb` }));

/**
 * Basic request logging.
 */
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms} ms)`
    );
  });
  next();
});

/**
 * Auth helper.
 */
function isAuthorized(req) {
  if (!RENDER_API_KEY) return true;

  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;

  const token = auth.slice(7).trim();
  return token === RENDER_API_KEY;
}

/**
 * Middleware for protected routes.
 */
function requireAuth(req, res, next) {
  if (isAuthorized(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Sanitizes a suggested filename for Content-Disposition.
 */
function sanitizeFileName(name) {
  const fallback = 'document.pdf';
  const raw = String(name || '').trim();
  if (!raw) return fallback;

  // Remove dangerous characters and collapse whitespace.
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return fallback;
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

/**
 * Validates incoming body.
 */
function validateRenderRequest(body) {
  if (!body || typeof body !== 'object') {
    return 'Missing JSON body.';
  }

  if (typeof body.html !== 'string' || !body.html.trim()) {
    return 'Missing html string.';
  }

  if (body.fileName != null && typeof body.fileName !== 'string') {
    return 'fileName must be a string when provided.';
  }

  return '';
}

/**
 * Launches Puppeteer with settings friendly to Render/container hosting.
 */
async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=medium'
    ]
  });
}

/**
 * Renders HTML string to a PDF buffer.
 */
async function renderHtmlToPdfBuffer(html) {
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setViewport({
      width: 1200,
      height: 1600,
      deviceScaleFactor: 1
    });

    page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);
    page.setDefaultTimeout(PUPPETEER_TIMEOUT_MS);

    await page.setContent(html, {
      waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
      timeout: PUPPETEER_TIMEOUT_MS
    });

    // Give layout/images/barcodes one extra beat to settle.
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // Wait for images if any are still loading.
      const images = Array.from(document.images || []);
      await Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        })
      );

      await sleep(150);
    });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true
    });

    return pdf;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.error('Browser close failed:', err);
      }
    }
  }
}

/**
 * Health route.
 */
app.get('/health', (req, res) => {
  if (!ALLOW_HEALTH_WITHOUT_AUTH && !isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(200).json({
    ok: true,
    service: 'pantry-pdf-renderer',
    timestamp: new Date().toISOString(),
    authRequired: !!RENDER_API_KEY
  });
});

/**
 * Primary render route.
 */
app.post('/render-pdf', requireAuth, async (req, res) => {
  const validationError = validateRenderRequest(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const html = req.body.html;
  const fileName = sanitizeFileName(req.body.fileName);

  try {
    const pdfBytes = await renderHtmlToPdfBuffer(html);
    const pdfBuffer = Buffer.from(pdfBytes);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

    return res.status(200).end(pdfBuffer);
  } catch (err) {
    console.error('render-pdf failed:', err);

    return res.status(500).json({
      error: 'PDF render failed',
      detail: err && err.message ? err.message : String(err)
    });
  }
});

/**
 * 404 fallback.
 */
app.use((req, res) => {
  return res.status(404).json({ error: 'Not found' });
});

/**
 * Fatal process handlers.
 */
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

app.listen(PORT, () => {
  console.log(`PDF render service listening on port ${PORT}`);
});
