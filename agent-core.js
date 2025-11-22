// agent-core.js
// Empire Ops - Core Agent v1
// Node.js 18+, no external dependencies

const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');

// ---- CONFIG -------------------------------------------------------

const CONFIG = {
  agentName: process.env.AGENT_NAME || 'agent-core-02',
  agentRole: process.env.AGENT_ROLE || 'core',
  heartbeatIntervalMs: Number(process.env.HEARTBEAT_MS || 10_000), // 10s
  statusFile: process.env.STATUS_FILE || '/home/ops/agent/status.json',
  listenPort: Number(process.env.AGENT_PORT || 4002),
  controllerUrl: process.env.CONTROLLER_URL || null // reserved for future
};

// ---- UTILITIES ----------------------------------------------------

function getPrimaryIp() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return { iface: name, ip: addr.address };
      }
    }
  }
  return { iface: 'unknown', ip: '0.0.0.0' };
}

function getSnapshot() {
  const { iface, ip } = getPrimaryIp();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const load = os.loadavg();

  return {
    agent: {
      name: CONFIG.agentName,
      role: CONFIG.agentRole,
      version: '1.0.0',
      hostname: os.hostname(),
      iface,
      ip,
      pid: process.pid,
      uptime_s: Math.round(process.uptime())
    },
    system: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      load1: load[0],
      load5: load[1],
      load15: load[2],
      mem_total_mb: Math.round(memTotal / 1024 / 1024),
      mem_free_mb: Math.round(memFree / 1024 / 1024),
      mem_used_pct: Number(((memTotal - memFree) / memTotal * 100).toFixed(1)),
      boot_uptime_s: os.uptime()
    },
    controller: {
      url: CONFIG.controllerUrl,
      // later: last_success_ts, last_error, etc.
    },
    ts: new Date().toISOString()
  };
}

function writeStatus(snapshot) {
  try {
    const dir = path.dirname(CONFIG.statusFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG.statusFile, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error('[agent-core] Failed to write status file:', err.message);
  }
}

// ---- HEARTBEAT LOOP -----------------------------------------------

function heartbeat() {
  const snap = getSnapshot();
  console.log(
    `[agent-core] heartbeat`,
    `name=${snap.agent.name}`,
    `ip=${snap.agent.ip}`,
    `load1=${snap.system.load1.toFixed(2)}`,
    `mem_used=${snap.system.mem_used_pct}%`
  );

  writeStatus(snap);

  // placeholder: later we can POST to CONFIG.controllerUrl here
}

function startHeartbeatLoop() {
  heartbeat(); // fire immediately
  setInterval(heartbeat, CONFIG.heartbeatIntervalMs);
}

// ---- HTTP STATUS SERVER -------------------------------------------

function startHttpServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/status') {
      const snap = getSnapshot();
      const body = JSON.stringify(snap);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      });
      return res.end(body);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('agent-core: not found\n');
  });

  server.listen(CONFIG.listenPort, '0.0.0.0', () => {
    console.log(
      `[agent-core] HTTP status listening on 0.0.0.0:${CONFIG.listenPort} ` +
      `(name=${CONFIG.agentName})`
    );
  });

  server.on('error', (err) => {
    console.error('[agent-core] HTTP server error:', err.message);
  });
}

// ---- MAIN ---------------------------------------------------------

console.log('[agent-core] starting with config:', CONFIG);

startHeartbeatLoop();
startHttpServer();

// Add agent-core v1 -----------------------------------------------
