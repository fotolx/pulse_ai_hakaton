import http from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArrivalServer } from './arrival-server.mjs';

const dir = fileURLToPath(new URL('../.local', import.meta.url));
const logFile = path.join(dir, 'bridge.log');

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    await mkdir(dir, { recursive: true });
    await appendFile(logFile, line, 'utf8');
  } catch {}
  console.log(message);
}

async function isPortInUse(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/health`, res => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function start() {
  const port = Number(process.env.ARRIVAL_PORT) || 3001;
  const alreadyRunning = await isPortInUse(port);
  if (alreadyRunning) {
    await log(`Bridge is already running and healthy on port ${port}.`);
    return;
  }

  await log(`Starting CollectorAI bridge server on 0.0.0.0:${port}...`);
  try {
    const server = await createArrivalServer();
    server.on('error', async err => {
      await log(`Server error: ${err.message}`);
      if (err.code === 'EADDRINUSE') {
        await log(`Port ${port} in use. Will retry in 5 seconds.`);
        setTimeout(start, 5000);
      }
    });

    server.listen(port, '0.0.0.0', async () => {
      await log(`CollectorAI bridge active: http://0.0.0.0:${port}`);
    });

    process.on('uncaughtException', async err => {
      await log(`Uncaught exception: ${err.stack || err.message}`);
    });
    process.on('unhandledRejection', async reason => {
      await log(`Unhandled rejection: ${reason}`);
    });
  } catch (err) {
    await log(`Failed to create server: ${err.message}. Retrying in 3 seconds...`);
    setTimeout(start, 3000);
  }
}

start();
