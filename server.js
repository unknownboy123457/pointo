const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present (Server-side ONLY)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    } catch (e) {
      console.warn('Warning: Could not read .env file:', e.message);
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 5500;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// ====================================================================
// AI BACKEND PROXY SERVICE (Server-side API Key Security)
// ====================================================================

function getAiConfig() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey && geminiKey.trim().length > 0) {
    return { provider: 'gemini', apiKey: geminiKey.trim() };
  }
  if (openaiKey && openaiKey.trim().length > 0) {
    return { provider: 'openai', apiKey: openaiKey.trim() };
  }
  return { provider: 'none', apiKey: null };
}

/**
 * Call Gemini Vision API (Google Gemini 1.5/2.0 Flash)
 */
function callGeminiVision(apiKey, base64Data, mimeType) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`);

    const promptText = `Analyze this Free Fire esports match screenshot.
Free Fire matches have up to 12 team slots (numbered 1 to 12), with up to 4 players per squad.

Determine if the screenshot is:
1) "slot_list": Lobby screen showing team slot numbers 1 to 12, team names, and list of player names in each slot.
2) "end_result": Match end scoreboard / battle results screen showing placement rank (1 to 12), team name, individual player names, and their kill counts.

Extract structured data into JSON format with this exact schema:
{
  "category": "slot_list" or "end_result",
  "confidence": 0.0 to 1.0,
  "entries": [
    // For slot_list:
    { "slot": 1..12, "teamName": "string", "players": ["player1", "player2"] }
    // For end_result:
    { "rank": 1..12, "teamName": "string", "player": "player name", "kills": 0 }
  ],
  "unreadableFields": ["list of any unreadable or blurred text"],
  "rawSummary": "Brief readable summary of detected text"
}
Return ONLY valid JSON with no markdown wrapping.`;

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType || 'image/jpeg',
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
      },
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject({ statusCode: 401, message: 'Invalid AI API key or unauthorized access to AI provider.', code: 'INVALID_CREDENTIALS' });
        }
        if (res.statusCode === 429) {
          return reject({ statusCode: 429, message: 'AI rate limit or quota exceeded. Please try again later or use Manual Mode.', code: 'QUOTA_EXCEEDED' });
        }
        if (res.statusCode >= 500) {
          return reject({ statusCode: 502, message: 'AI provider service is currently unavailable. Please try again or use Manual Mode.', code: 'PROVIDER_ERROR' });
        }
        if (res.statusCode >= 400) {
          return reject({ statusCode: res.statusCode, message: `AI provider error (${res.statusCode}): ${data.slice(0, 200)}`, code: 'API_ERROR' });
        }

        try {
          const parsed = JSON.parse(data);
          const candidateText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!candidateText) {
            return reject({ statusCode: 502, message: 'AI did not return any candidate content.', code: 'EMPTY_RESPONSE' });
          }
          const cleanText = candidateText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          const structuredData = JSON.parse(cleanText);
          resolve(structuredData);
        } catch (err) {
          reject({ statusCode: 502, message: 'Failed to parse structured JSON from AI provider.', code: 'MALFORMED_RESPONSE' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ statusCode: 504, message: 'AI extraction timed out. Please try again or use Manual Mode.', code: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      reject({ statusCode: 504, message: `Network error connecting to AI provider: ${err.message}`, code: 'NETWORK_ERROR' });
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Call OpenAI Vision API (gpt-4o-mini)
 */
function callOpenAIVision(apiKey, base64Data, mimeType) {
  return new Promise((resolve, reject) => {
    const promptText = `Analyze this Free Fire esports match screenshot.
Free Fire matches have up to 12 team slots (numbered 1 to 12), with up to 4 players per squad.

Determine if the screenshot is:
1) "slot_list": Lobby screen showing team slot numbers 1 to 12, team names, and list of player names in each slot.
2) "end_result": Match end scoreboard / battle results screen showing placement rank (1 to 12), team name, individual player names, and their kill counts.

Extract structured data into JSON format with this exact schema:
{
  "category": "slot_list" or "end_result",
  "confidence": 0.0 to 1.0,
  "entries": [
    // For slot_list:
    { "slot": 1..12, "teamName": "string", "players": ["player1", "player2"] }
    // For end_result:
    { "rank": 1..12, "teamName": "string", "player": "player name", "kills": 0 }
  ],
  "unreadableFields": ["list of any unreadable or blurred text"],
  "rawSummary": "Brief readable summary of detected text"
}
Return ONLY valid JSON.`;

    const requestBody = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.1,
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject({ statusCode: 401, message: 'Invalid OpenAI API key or unauthorized access.', code: 'INVALID_CREDENTIALS' });
        }
        if (res.statusCode === 429) {
          return reject({ statusCode: 429, message: 'OpenAI rate limit or quota exceeded. Please try again later or use Manual Mode.', code: 'QUOTA_EXCEEDED' });
        }
        if (res.statusCode >= 500) {
          return reject({ statusCode: 502, message: 'OpenAI service is currently unavailable. Please try again or use Manual Mode.', code: 'PROVIDER_ERROR' });
        }
        if (res.statusCode >= 400) {
          return reject({ statusCode: res.statusCode, message: `OpenAI error (${res.statusCode}): ${data.slice(0, 200)}`, code: 'API_ERROR' });
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) {
            return reject({ statusCode: 502, message: 'OpenAI returned an empty response.', code: 'EMPTY_RESPONSE' });
          }
          const cleanText = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          const structuredData = JSON.parse(cleanText);
          resolve(structuredData);
        } catch (err) {
          reject({ statusCode: 502, message: 'Failed to parse structured JSON from OpenAI.', code: 'MALFORMED_RESPONSE' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ statusCode: 504, message: 'OpenAI request timed out. Please try again or use Manual Mode.', code: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      reject({ statusCode: 504, message: `Network error connecting to OpenAI: ${err.message}`, code: 'NETWORK_ERROR' });
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Handle API requests under /api/ai/*
 */
async function handleAiApi(req, res) {
  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  const urlPath = req.url.split('?')[0];

  // GET /api/ai/health or /api/ai/status
  if (req.method === 'GET' && (urlPath === '/api/ai/health' || urlPath === '/api/ai/status')) {
    const config = getAiConfig();
    res.writeHead(200, corsHeaders);
    return res.end(JSON.stringify({
      status: 'ok',
      configured: config.provider !== 'none',
      provider: config.provider,
      supportedFormats: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
      maxSizeBytes: 10 * 1024 * 1024,
    }));
  }

  // POST /api/ai/extract
  if (req.method === 'POST' && urlPath === '/api/ai/extract') {
    const config = getAiConfig();

    // Check credentials before processing payload
    if (config.provider === 'none') {
      res.writeHead(503, corsHeaders);
      return res.end(JSON.stringify({
        success: false,
        error: 'AI vision credentials not configured on the server. Set GEMINI_API_KEY or OPENAI_API_KEY in server environment variables to enable vision AI, or use Manual Mode.',
        code: 'MISSING_CREDENTIALS',
      }));
    }

    // Collect request body
    const chunks = [];
    let totalBytes = 0;
    const MAX_PAYLOAD = 15 * 1024 * 1024; // 15MB limit for request

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_PAYLOAD) {
        req.destroy();
        res.writeHead(413, corsHeaders);
        return res.end(JSON.stringify({
          success: false,
          error: 'Image payload exceeds 15MB maximum size.',
          code: 'PAYLOAD_TOO_LARGE',
        }));
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let payload = null;

        // Try JSON parsing
        try {
          payload = JSON.parse(rawBody);
        } catch (_) {}

        if (!payload || !payload.image) {
          res.writeHead(400, corsHeaders);
          return res.end(JSON.stringify({
            success: false,
            error: 'Missing image in request body. Send JSON with { image: base64Data, mimeType }.',
            code: 'INVALID_REQUEST',
          }));
        }

        let base64Data = payload.image;
        let mimeType = payload.mimeType || 'image/jpeg';

        if (base64Data.startsWith('data:')) {
          const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          }
        }

        const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!supportedTypes.includes(mimeType)) {
          res.writeHead(400, corsHeaders);
          return res.end(JSON.stringify({
            success: false,
            error: `Unsupported image format (${mimeType}). Supported formats: PNG, JPG, WebP.`,
            code: 'UNSUPPORTED_FORMAT',
          }));
        }

        const bufferLength = Buffer.from(base64Data, 'base64').length;
        if (bufferLength > 10 * 1024 * 1024) {
          res.writeHead(400, corsHeaders);
          return res.end(JSON.stringify({
            success: false,
            error: 'Image file exceeds 10MB limit.',
            code: 'FILE_TOO_LARGE',
          }));
        }

        // Call provider
        let result = null;
        if (config.provider === 'gemini') {
          result = await callGeminiVision(config.apiKey, base64Data, mimeType);
        } else if (config.provider === 'openai') {
          result = await callOpenAIVision(config.apiKey, base64Data, mimeType);
        }

        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({
          success: true,
          category: result.category || 'unknown',
          entries: Array.isArray(result.entries) ? result.entries : [],
          rawText: result.rawSummary || null,
          confidence: typeof result.confidence === 'number' ? result.confidence : 0.9,
          unreadableFields: Array.isArray(result.unreadableFields) ? result.unreadableFields : [],
        }));
      } catch (err) {
        console.error('Server AI Error:', err.message || err);
        const statusCode = err.statusCode || 500;
        res.writeHead(statusCode, corsHeaders);
        res.end(JSON.stringify({
          success: false,
          error: err.message || 'AI extraction failed.',
          code: err.code || 'AI_EXTRACTION_ERROR',
        }));
      }
    });

    return;
  }

  // Unknown API route
  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({ error: 'Endpoint not found', code: 'NOT_FOUND' }));
}

// ====================================================================
// STATIC HTTP SERVER
// ====================================================================

const server = http.createServer((req, res) => {
  // Route /api/ai/* to AI handler
  if (req.url.startsWith('/api/ai')) {
    return handleAiApi(req, res);
  }

  // Parse URL and sanitize path
  let safePath = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure file is inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing if requested file doesn't exist
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('500 Internal Server Error');
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(content);
    });
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    const aiConf = getAiConfig();
    console.log(`LRD PointCalc development server running at:`);
    console.log(`  > Local:       http://localhost:${PORT}`);
    console.log(`  > Network:     http://127.0.0.1:${PORT}`);
    console.log(`  > AI Backend:  /api/ai/extract [Provider: ${aiConf.provider}]`);
  });
}

module.exports = { server, handleAiApi, getAiConfig };

