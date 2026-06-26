import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = path.resolve(__dirname, '../../eluru.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDatabase() {
  console.log(`Initializing SQLite database at: ${dbPath}`);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      badge_number TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('officer', 'dispatcher')) NOT NULL,
      status TEXT CHECK(status IN ('Available', 'Patrolling', 'Assigned', 'Busy', 'Emergency', 'Lost Connection', 'Offline')) NOT NULL DEFAULT 'Offline',
      battery INTEGER DEFAULT 100,
      team_id TEXT,
      last_heartbeat INTEGER,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT CHECK(priority IN ('P1', 'P2', 'P3', 'P4')) NOT NULL,
      status TEXT CHECK(status IN ('Open', 'Dispatched', 'Resolved', 'Closed')) NOT NULL DEFAULT 'Open',
      location_lat REAL,
      location_lng REAL,
      reporter_id TEXT NOT NULL,
      assignee_id TEXT,
      timestamp INTEGER NOT NULL,
      timeline TEXT NOT NULL, -- JSON array of events
      FOREIGN KEY(reporter_id) REFERENCES users(id),
      FOREIGN KEY(assignee_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT,
      team_id TEXT,
      body TEXT NOT NULL,
      priority INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      is_broadcast INTEGER DEFAULT 0, -- 0 = false, 1 = true
      FOREIGN KEY(sender_id) REFERENCES users(id),
      FOREIGN KEY(recipient_id) REFERENCES users(id),
      FOREIGN KEY(team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      officer_id TEXT NOT NULL,
      incident_id TEXT,
      description TEXT,
      file_path TEXT NOT NULL,
      hash TEXT NOT NULL, -- SHA-256 Checksum
      location_lat REAL,
      location_lng REAL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(officer_id) REFERENCES users(id),
      FOREIGN KEY(incident_id) REFERENCES incidents(id)
    );

    CREATE TABLE IF NOT EXISTS gps_logs (
      id TEXT PRIMARY KEY,
      officer_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      heading REAL,
      speed REAL,
      battery INTEGER NOT NULL,
      accuracy REAL,
      network_quality TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(officer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      officer_id TEXT,
      device_name TEXT NOT NULL,
      battery_level INTEGER DEFAULT 100,
      network_type TEXT NOT NULL,
      firmware_version TEXT NOT NULL,
      ip_address TEXT,
      mac_address TEXT,
      last_sync INTEGER NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(officer_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      ip_address TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Seed default data if empty
  const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
  if (teamCount.count === 0) {
    console.log('Seeding initial tactical teams...');
    const insertTeam = db.prepare('INSERT INTO teams (id, name, description, color) VALUES (?, ?, ?, ?)');
    insertTeam.run('t1', 'Alpha Team', 'Frontline disaster rescue team', '#00E5FF'); // Neon Cyan
    insertTeam.run('t2', 'Bravo Team', 'Tactical perimeter containment team', '#FFD600'); // Warning Amber
    insertTeam.run('t3', 'Charlie Team', 'Command backup & medical logistics', '#00E676'); // Active Green
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    console.log('Seeding initial police and command personnel...');
    const insertUser = db.prepare('INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    const defaultPinHash = bcrypt.hashSync('police', 10);
    
    // Seed Dispatcher
    insertUser.run('u_disp1', 'admin', defaultPinHash, 'AP Command Center', 'dispatcher', 'Available', 100, null, Date.now());
    
    // Seed Officers
    insertUser.run('u_off1', 'p1', defaultPinHash, 'Srinivas', 'officer', 'Offline', 92, 't1', Date.now());
    insertUser.run('u_off2', 'p2', defaultPinHash, 'Akshaya', 'officer', 'Offline', 88, 't1', Date.now());
    insertUser.run('u_off3', 'p3', defaultPinHash, 'Varun', 'officer', 'Offline', 95, 't2', Date.now());
    insertUser.run('u_off4', 'p4', defaultPinHash, 'Police 4', 'officer', 'Offline', 79, 't2', Date.now());
    insertUser.run('u_off5', 'p5', defaultPinHash, 'Police 5', 'officer', 'Offline', 84, 't3', Date.now());
  }

  console.log('Database schema successfully migrated and seeded.');
}

export default db;
