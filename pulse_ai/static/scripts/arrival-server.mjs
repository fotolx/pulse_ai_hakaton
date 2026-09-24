import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateArrival(input) {
  const result = {};
  for (const key of ['id', 'technicianName', 'position', 'nodeId', 'nodeName', 'district', 'task', 'arrivedAt']) {
    if (typeof input?.[key] !== 'string' || !input[key].trim() || input[key].length > 300) throw new Error(`Invalid ${key}`);
    result[key] = input[key].trim();
  }
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(result.id) || !Number.isFinite(Date.parse(result.arrivedAt))) throw new Error('Invalid arrival');
  result.arrivedAt = new Date(result.arrivedAt).toISOString();
  return result;
}

export function validateTask(input) {
  const result = {};
  for (const key of ['id', 'technicianName', 'position', 'nodeId', 'nodeName', 'district', 'task', 'closedAt']) {
    if (typeof input?.[key] !== 'string' || !input[key].trim() || input[key].length > 300) throw new Error(`Invalid ${key}`);
    result[key] = input[key].trim();
  }
  if (!/^[a-zA-Z0-9_-]{6,120}$/.test(result.id) || !Number.isFinite(Date.parse(result.closedAt))) throw new Error('Invalid task');
  result.closedAt = new Date(result.closedAt).toISOString();
  result.comment = typeof input?.comment === 'string' ? input.comment.trim() : '';
  result.statusMap = (typeof input?.statusMap === 'object' && input.statusMap !== null) ? input.statusMap : {};
  result.checklist = Array.isArray(input?.checklist) ? input.checklist : [];
  result.photos = Array.isArray(input?.photos) ? input.photos : [];
  return result;
}

function allowedOrigin(origin) {
  const configured = (process.env.ALLOWED_ORIGINS || 'https://pulse-ai.5d4.ru').split(',').map(value => value.trim());
  if (configured.includes(origin)) return true;
  if (!origin) return true; // Native Expo requests do not send Origin.
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
  } catch { return false; }
}

export async function createArrivalServer({
  file = process.env.COLLECTOR_DATA_DIR ? path.join(process.env.COLLECTOR_DATA_DIR, 'arrivals.json') : fileURLToPath(new URL('../.local/arrivals.json', import.meta.url)),
  tasksFile = process.env.COLLECTOR_DATA_DIR ? path.join(process.env.COLLECTOR_DATA_DIR, 'tasks.json') : fileURLToPath(new URL('../.local/tasks.json', import.meta.url)),
} = {}) {
  let items = [];
  try { items = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  let taskItems = [];
  try { taskItems = JSON.parse(await readFile(tasksFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  let writes = Promise.resolve();
  let taskWrites = Promise.resolve();

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    if (!allowedOrigin(origin)) { reply(403, { error: 'Origin is not allowed' }); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const route = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && route === '/health') { reply(200, { ok: true }); return; }
    if (req.method === 'GET' && route === '/api/arrivals') { reply(200, { items }); return; }
    if (req.method === 'GET' && (route === '/api/tasks' || route === '/api/picket-tasks')) { reply(200, { items: taskItems }); return; }

    if (req.method === 'POST' && route === '/api/arrivals') {
      let arrival;
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16384) { reply(413, { error: 'Payload too large' }); return; }
          chunks.push(chunk);
        }
        arrival = validateArrival(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch { reply(400, { error: 'Invalid arrival data' }); return; }
      // Serialize durable writes so simultaneous confirmations cannot overwrite each other.
      const save = writes.then(async () => {
        const existing = items.find(item => item.id === arrival.id);
        if (existing) {
          if (Object.keys(arrival).some(key => arrival[key] !== existing[key])) { reply(409, { error: 'ID already used' }); return; }
          reply(200, { item: existing }); return;
        }
        const item = { ...arrival, receivedAt: new Date().toISOString() };
        const next = [...items, item];
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(next), 'utf8');
        await rename(`${file}.tmp`, file);
        items = next;
        reply(201, { item });
      });
      writes = save.catch(() => {});
      try { await save; } catch { reply(500, { error: 'Arrival could not be saved' }); }
      return;
    }

    if (req.method === 'POST' && (route === '/api/tasks' || route === '/api/picket-tasks')) {
      let task;
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 52428800) { reply(413, { error: 'Payload too large' }); return; }
          chunks.push(chunk);
        }
        task = validateTask(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch { reply(400, { error: 'Invalid task data' }); return; }

      const saveTask = taskWrites.then(async () => {
        const existing = taskItems.find(item => item.id === task.id);
        if (existing) {
          if (['technicianName', 'position', 'nodeId', 'nodeName', 'district', 'task', 'closedAt'].some(key => task[key] !== existing[key])) {
            reply(409, { error: 'ID already used' });
            return;
          }
          reply(200, { item: existing });
          return;
        }
        const item = { ...task, receivedAt: new Date().toISOString() };
        const next = [...taskItems, item];
        await mkdir(path.dirname(tasksFile), { recursive: true });
        await writeFile(`${tasksFile}.tmp`, JSON.stringify(next), 'utf8');
        await rename(`${tasksFile}.tmp`, tasksFile);
        taskItems = next;
        reply(201, { item });
      });
      taskWrites = saveTask.catch(() => {});
      try { await saveTask; } catch { reply(500, { error: 'Task could not be saved' }); }
      return;
    }

    reply(404, { error: 'Not found' });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createArrivalServer();
  const port = Number(process.env.ARRIVAL_PORT) || 3001;
  server.listen(port, '0.0.0.0', () => console.log(`CollectorAI bridge: http://0.0.0.0:${port}`));
}

