import express from 'express';
import cors from 'cors';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load backend/.env regardless of process CWD (e.g. when launched by Electron from frontend/)
for (const candidate of [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env')
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

import { initDatabase, getActiveDistrictId, getDbPath } from './config/db';
import authRoutes from './routes/auth';
import apiRoutes from './routes/api';
import { SocketManager } from './sockets/socketManager';
import { CloudSyncService } from './services/sync/CloudSyncService';

function getLanIPs(): string[] {
  const ips: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

export function createHeroApp() {
  initDatabase();

  const app = express();

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json({ limit: '10mb' }));

  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  app.get('/health', (req, res) => {
    const activeDistrictId = getActiveDistrictId();
    res.json({
      status: 'Operational',
      mode: 'District Command Node',
      districtId: activeDistrictId,
      lanIPs: getLanIPs(),
      syncStatus: CloudSyncService.getStatus(activeDistrictId),
      timestamp: Date.now()
    });
  });

  const server = http.createServer(app);
  const socketManager = new SocketManager(server);
  app.set('socketManager', socketManager);

  return { app, server, socketManager };
}

export function startHeroServer(portOverride?: number) {
  const { app, server, socketManager } = createHeroApp();
  const port = portOverride ?? Number(process.env.PORT || 5001);

  // Immediately pull any cloud-assigned districts/officers on boot if online, then keep syncing
  if (CloudSyncService.getCloudConfig().configured) {
    CloudSyncService.pullAllFromCloud().catch(() => {});
  }
  CloudSyncService.startAutoSync(20000);

  server.listen(port, '0.0.0.0', () => {
    const lanIPs = getLanIPs();
    console.log(`========================================================`);
    console.log(` HERO DISTRICT COMMAND NODE RUNNING`);
    console.log(` Port: ${port}`);
    console.log(` Active District: ${getActiveDistrictId()}`);
    console.log(` LAN IPs: ${lanIPs.length ? lanIPs.join(', ') : 'localhost only'}`);
    console.log(` Database: ${getDbPath()}`);
    console.log(`========================================================`);
  });

  const stop = () => {
    CloudSyncService.stopAutoSync();
    socketManager.stop();
    server.close();
  };

  return { app, server, socketManager, stop };
}

if (require.main === module) {
  startHeroServer();
}
