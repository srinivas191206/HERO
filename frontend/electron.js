// frontend/electron.js — Standalone Offline-First HERO District Command Desktop App
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

let staticServer = null;
let backendProcess = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8'
};

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function resolveOutDir() {
  const localOut = path.join(__dirname, 'out');
  if (fs.existsSync(localOut)) return localOut;
  const resourcesOut = path.join(process.resourcesPath || __dirname, 'out');
  return resourcesOut;
}

function resolveBackendEntry() {
  const workspaceEntry = path.resolve(__dirname, '../backend/dist/index.js');
  if (fs.existsSync(workspaceEntry)) return workspaceEntry;
  const packagedEntry = path.join(process.resourcesPath || __dirname, 'backend/dist/index.js');
  if (fs.existsSync(packagedEntry)) return packagedEntry;
  return null;
}

function startOfflineStaticServer(outDir) {
  return new Promise((resolve) => {
    staticServer = http.createServer((req, res) => {
      const reqUrl = (req.url || '/').split('?')[0];
      let relativePath = decodeURIComponent(reqUrl);
      if (relativePath === '/') relativePath = '/index.html';

      let targetPath = path.join(outDir, relativePath);

      // Handle Next.js static export clean routes: /command -> /command.html, /admin -> /admin.html, etc.
      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        const htmlCandidate = path.join(outDir, `${relativePath.replace(/\/$/, '')}.html`);
        if (fs.existsSync(htmlCandidate)) {
          targetPath = htmlCandidate;
        } else if (fs.existsSync(path.join(targetPath, 'index.html'))) {
          targetPath = path.join(targetPath, 'index.html');
        } else {
          targetPath = path.join(outDir, '404.html');
        }
      }

      if (!targetPath.startsWith(outDir) || !fs.existsSync(targetPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(targetPath).pipe(res);
    });

    staticServer.listen(3005, '0.0.0.0', () => {
      resolve(3005);
    });

    staticServer.on('error', () => {
      // Fallback to ephemeral port if 3005 is occupied
      staticServer.listen(0, '0.0.0.0', () => {
        resolve(staticServer.address().port);
      });
    });
  });
}

function resolveNodeExecutable() {
  if (!app.isPackaged) {
    for (const candidate of ['/usr/local/bin/node', '/opt/homebrew/bin/node']) {
      if (fs.existsSync(candidate)) {
        return { cmd: candidate, isElectronNode: false };
      }
    }
  }
  return { cmd: process.execPath, isElectronNode: true };
}

async function ensureEmbeddedBackend() {
  const alreadyRunning = await isPortOpen(5001, '127.0.0.1');
  if (alreadyRunning) {
    console.log('[Electron] District Command Node already listening on :5001');
    return;
  }

  const backendEntry = resolveBackendEntry();
  if (!backendEntry) {
    console.warn('[Electron] Embedded backend entry not found (backend/dist/index.js). Run `npm run build --prefix backend` first.');
    return;
  }

  const defaultDbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'hero-district.db')
    : path.resolve(__dirname, '../backend/eluru.db');

  const nodeExec = resolveNodeExecutable();
  console.log(`[Electron] Starting embedded District Command Node (${backendEntry}) via ${nodeExec.cmd}...`);
  const env = {
    ...process.env,
    PORT: process.env.PORT || '5001',
    HERO_DB_PATH: process.env.HERO_DB_PATH || defaultDbPath
  };
  if (nodeExec.isElectronNode) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  backendProcess = spawn(nodeExec.cmd, [backendEntry], {
    env,
    stdio: 'inherit'
  });
}

async function createWindow() {
  await ensureEmbeddedBackend();

  const outDir = resolveOutDir();
  const devMode = process.env.HERO_ELECTRON_DEV === '1';
  let startUrl = 'http://localhost:3005/login';

  if (!devMode && fs.existsSync(outDir)) {
    const port = await startOfflineStaticServer(outDir);
    startUrl = `http://127.0.0.1:${port}/login`;
    console.log(`[Electron] Serving offline static UI from ${outDir} at ${startUrl}`);
  } else {
    console.log(`[Electron] Loading dev server at ${startUrl}`);
  }

  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    title: 'HERO – Hybrid Emergency Response & Operations (District Node)',
    icon: path.join(__dirname, 'public/ap-police-logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  win.loadURL(startUrl);
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
