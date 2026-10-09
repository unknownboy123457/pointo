const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\hp\\.gemini\\antigravity-ide\\brain\\8062dee6-2a47-4f77-b2a6-39490209d446';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge-test-profile-' + Date.now());

async function run() {
  console.log('Launching Edge headless...');
  const edge = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const json = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json/version', res => {
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      if (json.webSocketDebuggerUrl) {
        wsUrl = json.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('Failed to get WebSocket debugger URL');
    edge.kill();
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = msg => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.targetId;
  const session = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = session.sessionId;

  function sendSession(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, sessionId, method, params }));
    });
  }

  await sendSession('Page.enable');
  await sendSession('Runtime.enable');

  // Set Mobile Viewport: 390 x 844
  console.log('Setting viewport to 390x844 (Mobile)...');
  await sendSession('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  console.log('Navigating to app with autoGuest=1 and screen=ai-scanner...');
  await sendSession('Page.navigate', { url: 'http://localhost:5500/?autoGuest=1&screen=ai-scanner' });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Mobile Top: Header + Card 1
  console.log('Capturing 01_mobile_top.png...');
  await sendSession('Runtime.evaluate', {
    expression: `document.querySelector('.scanner-scroll-wrap').scrollTop = 0;`
  });
  await new Promise(r => setTimeout(r, 400));
  const shot1 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '01_mobile_top.png'), Buffer.from(shot1.data, 'base64'));

  // 2. Mobile Card 2: Result Screenshots + Compact team rows + Enter player kills
  console.log('Capturing 02_mobile_card2_results.png...');
  await sendSession('Runtime.evaluate', {
    expression: `
      const el = document.getElementById('scanner-card-results');
      if (el) document.querySelector('.scanner-scroll-wrap').scrollTop = el.offsetTop - 10;
    `
  });
  await new Promise(r => setTimeout(r, 400));
  const shot2 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '02_mobile_card2_results.png'), Buffer.from(shot2.data, 'base64'));

  // 3. Mobile Card 3: 12-Slot Review & Edit (compact cards)
  console.log('Capturing 03_mobile_12slots_review.png...');
  await sendSession('Runtime.evaluate', {
    expression: `
      const el = document.getElementById('scanner-card-12slots');
      if (el) document.querySelector('.scanner-scroll-wrap').scrollTop = el.offsetTop - 10;
    `
  });
  await new Promise(r => setTimeout(r, 400));
  const shot3 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '03_mobile_12slots_review.png'), Buffer.from(shot3.data, 'base64'));

  // 4. Mobile Slot 1 Expanded with edit controls
  console.log('Capturing 04_mobile_slot_expanded.png...');
  await sendSession('Runtime.evaluate', {
    expression: `
      const btn = document.querySelector('.scanner-btn-expand-slot');
      btn?.click();
    `
  });
  await new Promise(r => setTimeout(r, 400));
  const shot4 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '04_mobile_slot_expanded.png'), Buffer.from(shot4.data, 'base64'));

  // Set Desktop Viewport: 1440 x 900
  console.log('Setting viewport to 1440x900 (Desktop)...');
  await sendSession('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  // 5. Desktop Top (Centered layout)
  console.log('Capturing 05_desktop_top.png...');
  await sendSession('Runtime.evaluate', {
    expression: `document.querySelector('.scanner-scroll-wrap').scrollTop = 0;`
  });
  await new Promise(r => setTimeout(r, 500));
  const shot5 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '05_desktop_top.png'), Buffer.from(shot5.data, 'base64'));

  // 6. Desktop 12-slots Grid (2-column layout)
  console.log('Capturing 06_desktop_12slots_grid.png...');
  await sendSession('Runtime.evaluate', {
    expression: `
      const el = document.getElementById('scanner-card-12slots');
      if (el) document.querySelector('.scanner-scroll-wrap').scrollTop = el.offsetTop - 10;
    `
  });
  await new Promise(r => setTimeout(r, 500));
  const shot6 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '06_desktop_12slots_grid.png'), Buffer.from(shot6.data, 'base64'));

  ws.close();
  edge.kill();
  console.log('All screenshots captured successfully!');
}

run().catch(err => {
  console.error('Error running capture:', err);
  process.exit(1);
});
