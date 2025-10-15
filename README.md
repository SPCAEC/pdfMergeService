# PDF Merge Service (SPCA)

A lightweight PDF merge API built with **pdf-lib** and **Express**, used by Pantry Label Generator and Transportation Helper apps.

## 🧠 Features
- Accepts multiple PDFs as base64.
- Merges in memory — no temp files.
- Returns merged PDF as base64.
- 100 MB request body limit.
- Compatible with Google Apps Script `UrlFetchApp.fetch`.

## 🚀 Deployment
1. Create a new repo on GitHub named `pdf-merge-service`.
2. Push these files (`index.js`, `package.json`, `.gitignore`, `README.md`).
3. On [Render](https://render.com), create a new **Web Service**:
   - Connect your new repo.
   - Set **Build Command:** `npm install`
   - Set **Start Command:** `npm start`
   - Environment: Node 18+.
4. Once deployed, your endpoint will be: