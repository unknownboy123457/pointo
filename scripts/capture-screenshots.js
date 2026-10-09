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
  await sendSession('Page.navigate', { url: 'http://127.0.0.1:5500/?autoGuest=1&screen=ai-scanner' });
  await new Promise(r => setTimeout(r, 2500));

  // 1. Mobile Card 1: Lobby Slots (12 Slots)
  console.log('Capturing 01_mobile_card1_lobby_12slots.png...');
  const shot1 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '01_mobile_card1_lobby_12slots.png'), Buffer.from(shot1.data, 'base64'));

  // 2. Mobile Card 2: End Results (12 Slots)
  console.log('Capturing 02_mobile_card2_results_12slots.png...');
  await sendSession('Runtime.evaluate', {
    expression: `
      const el = document.getElementById('scanner-card-results');
      const wrap = document.querySelector('.scanner-scroll-wrap');
      if (el && wrap) wrap.scrollTop = el.offsetTop - 10;
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shot2 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '02_mobile_card2_results_12slots.png'), Buffer.from(shot2.data, 'base64'));

  // 3. Mobile Card 4: Match Points Preview table
  console.log('Capturing 03_mobile_standings_preview.png...');
  await sendSession('Runtime.evaluate', {
    expression: `
      const el = document.getElementById('scanner-card-standings');
      const wrap = document.querySelector('.scanner-scroll-wrap');
      if (el && wrap) wrap.scrollTop = el.offsetTop - 10;
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shot3 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '03_mobile_standings_preview.png'), Buffer.from(shot3.data, 'base64'));

  // Set Desktop Viewport: 1440 x 900
  console.log('Setting viewport to 1440x900 (Desktop)...');
  await sendSession('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  // 4. Desktop Card 1 & Card 2
  console.log('Capturing 04_desktop_12slots.png...');
  await sendSession('Runtime.evaluate', {
    expression: `
      const wrap = document.querySelector('.scanner-scroll-wrap');
      if (wrap) wrap.scrollTop = 0;
    `
  });
  await new Promise(r => setTimeout(r, 600));
  const shot4 = await sendSession('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, '04_desktop_12slots.png'), Buffer.from(shot4.data, 'base64'));

  ws.close();
  edge.kill();
  console.log('All screenshots captured successfully!');
}

run().catch(err => {
  console.error('Error running capture:', err);
  process.exit(1);
});
