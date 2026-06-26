import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { initDatabase } from './config/db';
import authRoutes from './routes/auth';
import apiRoutes from './routes/api';
import { SocketManager } from './sockets/socketManager';

// Load environmental parameters
dotenv.config();

// Initialize the SQLite Database Schema
initDatabase();

const app = express();
const port = process.env.PORT || 5001;

// Midlewares
app.use(cors({
  origin: '*', // Allow all nodes on local network
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' })); // Support base64 image transmissions

// REST routes mounting
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Base route for connectivity checking
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Operational', 
    mode: 'Command Node',
    timestamp: Date.now() 
  });
});

// Setup HTTP and Sockets server wrapper
const server = http.createServer(app);
const socketManager = new SocketManager(server);
app.set('socketManager', socketManager);

server.listen(Number(port), '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(` ELURU HEROES TACTICAL COMMAND NODE RUNNING`);
  console.log(` Port: ${port}`);
  console.log(` Environment: Local Offline Mesh Compatible`);
  console.log(` Database: SQLite (eluru.db) Connected`);
  console.log(`========================================================`);
});
