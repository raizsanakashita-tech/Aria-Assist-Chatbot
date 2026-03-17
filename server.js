/**
 * ════════════════════════════════════════════════════════
 *  ARIA — Local Proxy Server
 *  server.js  (Google Gemini API edition)
 *
 *  Fungsi:
 *  - Menyimpan GEMINI_API_KEY di sisi server (aman)
 *  - Menerima request dari browser (format internal ARIA)
 *  - Mengonversi ke format Google Gemini API
 *  - Meneruskan respons kembali ke browser
 *  - Melayani file statis (index.html, aria.js, aria.css)
 *
 *  Cara pakai:
 *  1. cp .env.example .env  → isi GEMINI_API_KEY
 *  2. npm start             → tidak perlu npm install
 *  3. Buka http://localhost:3000
 *
 *  Dapatkan API key gratis di:
 *  https://aistudio.google.com/app/apikey
 * ════════════════════════════════════════════════════════
 */

'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ── Load .env (tanpa package tambahan) ────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ── Config ─────────────────────────────────────────────
const PORT        = process.env.PORT || 3000;
const API_KEY     = process.env.GEMINI_API_KEY || '';

// Model Gemini — bisa diganti sesuai kebutuhan:
//   gemini-2.0-flash        → cepat, gratis, direkomendasikan
//   gemini-2.0-pro          → lebih pintar
//   gemini-1.5-flash        → alternatif stabil
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_HOST  = 'generativelanguage.googleapis.com';

// ── MIME types ─────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

// ── Helper: kirim JSON ─────────────────────────────────
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ── Helper: CORS headers ───────────────────────────────
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Helper: sajikan file statis ────────────────────────
function serveStatic(req, res) {
  const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

  // Cegah path traversal
  if (!path.resolve(filePath).startsWith(path.resolve(__dirname))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File tidak ditemukan: ${req.url}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ── Konverter: format ARIA → format Gemini ─────────────
//
//  Format masuk dari aria.js (internal):
//  {
//    system: "...",
//    messages: [ { role: "user"|"assistant", content: "..." }, ... ]
//  }
//
//  Format keluar ke Gemini API:
//  {
//    system_instruction: { parts: [{ text: "..." }] },
//    contents: [ { role: "user"|"model", parts: [{ text: "..." }] }, ... ]
//  }
//
function convertToGeminiFormat(ariaBody) {
  const systemInstruction = ariaBody.system
    ? { parts: [{ text: ariaBody.system }] }
    : undefined;

  // Gemini pakai "model" bukan "assistant"
  const contents = (ariaBody.messages || []).map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Gemini: giliran pertama harus "user"
  // Jika ada prefix "assistant" di awal, buang
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  return {
    ...(systemInstruction && { system_instruction: systemInstruction }),
    contents,
    generationConfig: {
      maxOutputTokens: ariaBody.max_tokens || 1500,
      temperature:     0.7,
    },
  };
}

// ── Konverter: respons Gemini → format mirip Anthropic ──
//  aria.js membaca: data.content[0].text
//  Gemini mengembalikan: candidates[0].content.parts[0].text
//
function convertFromGeminiFormat(geminiResponse) {
  const text = geminiResponse
    ?.candidates?.[0]
    ?.content
    ?.parts?.[0]
    ?.text || 'Tidak ada respons dari Gemini.';

  return {
    content: [{ type: 'text', text }],
    model:   GEMINI_MODEL,
    role:    'assistant',
  };
}

// ── Handler: proxy ke Google Gemini API ───────────────
function proxyToGemini(req, res) {
  if (!API_KEY) {
    return sendJSON(res, 500, {
      error: {
        type:    'config_error',
        message: 'GEMINI_API_KEY belum diisi di file .env. Dapatkan di https://aistudio.google.com/app/apikey',
      },
    });
  }

  let rawBody = '';
  req.on('data', chunk => { rawBody += chunk; });

  req.on('end', () => {
    // Parse body dari browser
    let ariaBody;
    try {
      ariaBody = JSON.parse(rawBody);
    } catch {
      return sendJSON(res, 400, {
        error: { type: 'parse_error', message: 'Request body bukan JSON valid.' },
      });
    }

    // Konversi ke format Gemini
    const geminiBody   = convertToGeminiFormat(ariaBody);
    const bodyBuffer   = Buffer.from(JSON.stringify(geminiBody));
    const geminiPath   = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;

    const options = {
      hostname: GEMINI_HOST,
      port:     443,
      path:     geminiPath,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': bodyBuffer.length,
      },
    };

    console.log(`[Gemini] POST ${GEMINI_MODEL} — ${ariaBody.messages?.length || 0} pesan`);

    const proxyReq = https.request(options, proxyRes => {
      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        try {
          const geminiJSON  = JSON.parse(data);

          // Jika Gemini mengembalikan error
          if (geminiJSON.error) {
            const errMsg  = geminiJSON.error.message || '';
            const errCode = geminiJSON.error.code || proxyRes.statusCode;
            console.error('[Gemini Error]', errCode, errMsg);

            // Terjemahkan error umum menjadi pesan yang lebih jelas
            let friendlyMsg = errMsg;
            if (errCode === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
              friendlyMsg = 'Quota Gemini API habis atau rate limit tercapai. '
                + 'Tunggu beberapa menit lalu coba lagi, atau cek usage di https://ai.dev/rate-limit. '
                + 'Kamu juga bisa ganti GEMINI_MODEL=gemini-1.5-flash di file .env.';
            } else if (errCode === 400 || errMsg.includes('API_KEY_INVALID')) {
              friendlyMsg = 'API key tidak valid. Pastikan GEMINI_API_KEY di .env sudah benar '
                + 'dan aktif di https://aistudio.google.com/app/apikey.';
            } else if (errCode === 403) {
              friendlyMsg = 'Akses ditolak. Aktifkan billing di Google Cloud Console '
                + 'atau pastikan API key memiliki izin yang cukup.';
            }

            setCORSHeaders(res);
            return sendJSON(res, errCode, {
              error: { type: 'gemini_error', message: friendlyMsg },
            });
          }

          // Konversi ke format yang dibaca aria.js
          const ariaResponse = convertFromGeminiFormat(geminiJSON);
          setCORSHeaders(res);
          sendJSON(res, 200, ariaResponse);

        } catch (parseErr) {
          console.error('[Parse Error]', parseErr.message);
          setCORSHeaders(res);
          sendJSON(res, 500, {
            error: { type: 'parse_error', message: 'Gagal memproses respons dari Gemini.' },
          });
        }
      });
    });

    proxyReq.on('error', err => {
      console.error('[Network Error]', err.message);
      setCORSHeaders(res);
      sendJSON(res, 502, {
        error: { type: 'network_error', message: `Gagal terhubung ke Google: ${err.message}` },
      });
    });

    proxyReq.write(bodyBuffer);
    proxyReq.end();
  });

  req.on('error', err => {
    sendJSON(res, 400, { error: { type: 'request_error', message: err.message } });
  });
}

// ── Main HTTP Server ───────────────────────────────────
const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    setCORSHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Route: proxy ke Gemini
  if (req.method === 'POST' && pathname === '/api/chat') {
    setCORSHeaders(res);
    proxyToGemini(req, res);
    return;
  }

  // Route: health check
  if (pathname === '/health') {
    sendJSON(res, 200, {
      status:    'ok',
      provider:  'Google Gemini',
      model:     GEMINI_MODEL,
      apiKey:    API_KEY ? '✓ Terkonfigurasi' : '✗ Belum diisi',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Route: file statis
  serveStatic(req, res);
});

// ── Start ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ⚡ ARIA Server — Google Gemini Edition');
  console.log('  ─────────────────────────────────────────');
  console.log(`  URL      : http://localhost:${PORT}`);
  console.log(`  Model    : ${GEMINI_MODEL}`);
  console.log(`  API Key  : ${API_KEY ? '✓ Terkonfigurasi' : '✗ BELUM DIISI'}`);
  console.log(`  Health   : http://localhost:${PORT}/health`);
  console.log('  ─────────────────────────────────────────');
  if (!API_KEY) {
    console.log('  ⚠  Edit .env → isi GEMINI_API_KEY');
    console.log('  ⚠  Dapatkan key gratis di: https://aistudio.google.com/app/apikey');
  }
  console.log('');
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });