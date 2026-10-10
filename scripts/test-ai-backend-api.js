/* ====================================================================
   LRD PointCalc — Backend AI Endpoint & Security Test Suite
   ==================================================================== */

const assert = require('assert');
const http = require('http');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ FAIL: ${desc}`);
      console.error(`    ${err.message}`);
      failed++;
    });
}

function makeRequest({ method, path, headers = {}, body = null, port = 5599 }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (res) => {
        let resData = '';
        res.on('data', (c) => (resData += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(resData);
          } catch (_) {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: resData,
            json,
          });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('RUNNING AI BACKEND SECURITY & ENDPOINT TESTS');
  console.log('====================================================\n');

  // Start test server on port 5599
  const { server } = require('../server.js');
  const testPort = 5599;
  await new Promise((resolve) => server.listen(testPort, '127.0.0.1', resolve));

  try {
    console.log('--- 1. Health & Configuration Discovery ---');
    await it('GET /api/ai/health returns 200 with provider info', async () => {
      const res = await makeRequest({ method: 'GET', path: '/api/ai/health', port: testPort });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.status, 'ok');
      assert.ok('configured' in res.json);
      assert.ok('provider' in res.json);
    });

    console.log('\n--- 2. Credential Security & Clear Blocker Reporting ---');
    await it('POST /api/ai/extract without credentials returns 503 with explicit blocker message', async () => {
      // Ensure no API key set in test
      const oldGemini = process.env.GEMINI_API_KEY;
      const oldOpenAI = process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const res = await makeRequest({
        method: 'POST',
        path: '/api/ai/extract',
        headers: { 'Content-Type': 'application/json' },
        body: {
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          mimeType: 'image/png',
        },
        port: testPort,
      });

      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(res.json.success, false);
      assert.strictEqual(res.json.code, 'MISSING_CREDENTIALS');
      assert.match(res.json.error, /AI vision credentials not configured/);
      assert.match(res.json.error, /Manual Mode/);

      // Restore
      if (oldGemini) process.env.GEMINI_API_KEY = oldGemini;
      if (oldOpenAI) process.env.OPENAI_API_KEY = oldOpenAI;
    });

    console.log('\n--- 3. Input Validation & Security Constraints ---');
    await it('POST /api/ai/extract rejects unsupported image formats with 400', async () => {
      // Mock API key to test validation logic
      process.env.GEMINI_API_KEY = 'test_key';

      const res = await makeRequest({
        method: 'POST',
        path: '/api/ai/extract',
        headers: { 'Content-Type': 'application/json' },
        body: {
          image: 'data:application/pdf;base64,JVBERi0xLjQK',
          mimeType: 'application/pdf',
        },
        port: testPort,
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.success, false);
      assert.strictEqual(res.json.code, 'UNSUPPORTED_FORMAT');

      delete process.env.GEMINI_API_KEY;
    });

    await it('Never exposes private API keys in headers, body or error strings', async () => {
      process.env.GEMINI_API_KEY = 'super_secret_private_gemini_key_12345';

      const res = await makeRequest({
        method: 'POST',
        path: '/api/ai/extract',
        headers: { 'Content-Type': 'application/json' },
        body: {
          image: 'data:image/png;base64,INVALID_IMAGE_DATA',
          mimeType: 'image/png',
        },
        port: testPort,
      });

      const responseString = JSON.stringify(res);
      assert.strictEqual(responseString.includes('super_secret_private_gemini_key_12345'), false);

      delete process.env.GEMINI_API_KEY;
    });

    console.log('\n====================================================');
    console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
    console.log('====================================================');
  } finally {
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

run();
