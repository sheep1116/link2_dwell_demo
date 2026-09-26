'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const DEFAULT_ENDPOINT = 'https://memory-frame-demo-d7djiee0702b6c.service.tcloudbase.com/api';
const EVENT_PREFIX = 'EVENT:';

function parseEventLine(line) {
  const marker = line.indexOf(EVENT_PREFIX);
  if (marker < 0) return null;
  let event;
  try {
    event = JSON.parse(line.slice(marker + EVENT_PREFIX.length).trim());
  } catch {
    throw new Error('EVENT line is not valid JSON');
  }
  if (!event || event.type !== 'presence.dwell') {
    throw new Error('Unsupported EVENT type');
  }
  for (const field of ['timestamp', 'dwellMs', 'headCount']) {
    if (!Number.isFinite(event[field])) throw new Error(`EVENT ${field} must be a number`);
  }
  if (!Number.isSafeInteger(event.timestamp) || event.timestamp <= 0) {
    throw new Error('EVENT timestamp must be a positive integer');
  }
  if (!Number.isSafeInteger(event.dwellMs) || event.dwellMs < 0 || event.dwellMs > 3600000) {
    throw new Error('EVENT dwellMs is outside the accepted range');
  }
  if (!Number.isSafeInteger(event.headCount) || event.headCount < 0 || event.headCount > 10) {
    throw new Error('EVENT headCount is outside the Link SDK range');
  }
  return Object.freeze({
    type: event.type,
    timestamp: event.timestamp,
    dwellMs: event.dwellMs,
    headCount: event.headCount,
  });
}

function createReport(event, options = {}) {
  return Object.freeze({
    action: 'presenceReport',
    data: Object.freeze({
      version: 1,
      eventId: options.eventId || crypto.randomUUID(),
      source: 'link2-windows',
      deviceId: options.deviceId || 'link2-windows',
      type: 'presence.dwell',
      occurredAt: event.timestamp,
      dwellMs: event.dwellMs,
      headCount: event.headCount,
    }),
  });
}

function isLoopback(url) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
}

function validateEndpoint(value, token) {
  let endpoint;
  try { endpoint = new URL(value); } catch { throw new Error('PRESENCE_ENDPOINT is not a valid URL'); }
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLoopback(endpoint))) {
    throw new Error('The cloud endpoint must use HTTPS; HTTP is allowed only for loopback testing');
  }
  if (!token && !isLoopback(endpoint)) {
    throw new Error('PRESENCE_SENSOR_TOKEN is required for a cloud endpoint');
  }
  return endpoint;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function postReport(report, options = {}) {
  const endpoint = validateEndpoint(options.endpoint || DEFAULT_ENDPOINT, options.token);
  const attempts = options.attempts ?? 5;
  const timeoutMs = options.timeoutMs ?? 10000;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (options.fetchImpl || fetch)(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body: JSON.stringify(report),
        signal: controller.signal,
      });
      const text = (await response.text()).slice(0, 500);
      if (!response.ok) {
        const detail = text.replace(/\s+/g, ' ').trim();
        throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      let body = null;
      if (text) {
        try { body = JSON.parse(text); } catch { body = { text }; }
      }
      return { attempt, status: response.status, body };
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error(`request timed out after ${timeoutMs} ms`) : error;
      if (attempt === attempts) break;
      await wait(Math.min(15000, baseDelayMs * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function parseArguments(argv) {
  const result = { demo: '', endpoint: process.env.PRESENCE_ENDPOINT || DEFAULT_ENDPOINT, dryRun: false, stdin: false, once: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--demo' || argument === '--endpoint') {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      result[argument.slice(2)] = value;
    } else if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--stdin') result.stdin = true;
    else if (argument === '--once') result.once = true;
    else if (argument === '--help' || argument === '-h') result.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function findDemo(explicitPath = '') {
  const candidates = explicitPath ? [explicitPath] : [
    path.join(__dirname, 'build-ninja', 'link2_dwell_demo.exe'),
    path.join(__dirname, 'build', 'Release', 'link2_dwell_demo.exe'),
    path.join(__dirname, 'build-vs', 'Release', 'link2_dwell_demo.exe'),
  ];
  const match = candidates.map(item => path.resolve(item)).find(item => fs.existsSync(item));
  if (!match) throw new Error(`Cannot find link2_dwell_demo.exe. Build it first or pass --demo PATH. Checked: ${candidates.join(', ')}`);
  return match;
}

function printHelp() {
  console.log(`Usage: node presence_uploader.cjs [options]\n\n` +
    `Options:\n` +
    `  --demo PATH       Path to link2_dwell_demo.exe\n` +
    `  --endpoint URL    CloudBase API endpoint\n` +
    `  --dry-run         Parse and print reports without sending\n` +
    `  --stdin           Read Demo output from stdin instead of starting it\n` +
    `  --once            Exit after the first EVENT is handled\n` +
    `  -h, --help        Show this help\n\n` +
    `Environment:\n` +
    `  PRESENCE_SENSOR_TOKEN   Bearer token issued by the server\n` +
    `  PRESENCE_DEVICE_ID      Stable sensor device ID (default: link2-windows)\n` +
    `  PRESENCE_ENDPOINT       Alternative endpoint URL`);
}

async function run(options) {
  const token = (process.env.PRESENCE_SENSOR_TOKEN || '').trim();
  const deviceId = (process.env.PRESENCE_DEVICE_ID || 'link2-windows').trim();
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(deviceId)) {
    throw new Error('PRESENCE_DEVICE_ID must contain 1-64 letters, digits, dots, underscores, or hyphens');
  }
  if (!options.dryRun) validateEndpoint(options.endpoint, token);

  let child = null;
  let handled = 0;
  let queue = Promise.resolve();
  let shuttingDown = false;

  const handleLine = line => {
    if (!line.includes(EVENT_PREFIX)) return;
    let event;
    try { event = parseEventLine(line); }
    catch (error) { console.error(`[presence] ignored malformed event: ${error.message}`); return; }
    const report = createReport(event, { deviceId });
    console.log(`[presence] captured ${report.data.type} eventId=${report.data.eventId} dwellMs=${report.data.dwellMs}`);
    queue = queue.then(async () => {
      if (options.dryRun) {
        console.log(`[presence] dry-run ${JSON.stringify(report)}`);
      } else {
        const result = await postReport(report, { endpoint: options.endpoint, token });
        console.log(`[presence] uploaded eventId=${report.data.eventId} status=${result.status} attempt=${result.attempt}`);
      }
      handled++;
      if (options.once) {
        shuttingDown = true;
        child?.kill();
      }
    }).catch(error => {
      console.error(`[presence] upload failed eventId=${report.data.eventId}: ${error.message}`);
      process.exitCode = 2;
      if (options.once) {
        shuttingDown = true;
        child?.kill();
      }
    });
  };

  let input;
  if (options.stdin) {
    input = process.stdin;
    console.log(`[presence] reading EVENT lines from stdin; endpoint=${options.dryRun ? 'dry-run' : options.endpoint}`);
  } else {
    const executable = findDemo(options.demo);
    console.log(`[presence] starting ${executable}`);
    console.log(`[presence] endpoint=${options.dryRun ? 'dry-run' : options.endpoint} deviceId=${deviceId}`);
    child = spawn(executable, [], {
      cwd: path.dirname(executable),
      windowsHide: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stderr.pipe(process.stderr);
    input = child.stdout;
    child.once('error', error => {
      console.error(`[presence] Demo failed to start: ${error.message}`);
      process.exitCode = 1;
    });
  }

  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  lines.on('line', line => {
    if (!options.stdin) console.log(`[demo] ${line}`);
    handleLine(line);
  });

  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    lines.close();
    child?.kill();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await new Promise(resolve => {
    if (child) child.once('exit', (code, signal) => {
      if (!shuttingDown && code !== 0) {
        console.error(`[presence] Demo exited code=${code ?? 'null'} signal=${signal ?? 'none'}`);
        process.exitCode = process.exitCode || 1;
      }
      resolve();
    });
    else lines.once('close', resolve);
  });
  await queue;
  if (options.once && handled === 0 && !process.exitCode) process.exitCode = 3;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) return printHelp();
    await run(options);
  } catch (error) {
    console.error(`[presence] ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = { DEFAULT_ENDPOINT, parseEventLine, createReport, validateEndpoint, postReport, findDemo, parseArguments };
