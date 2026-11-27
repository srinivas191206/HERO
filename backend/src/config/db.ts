import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const DEFAULT_DISTRICT_ID = 'd_eluru';
const dbPath = process.env.HERO_DB_PATH
  ? path.resolve(process.env.HERO_DB_PATH)
  : path.resolve(__dirname, '../../eluru.db');

const db = new Database(dbPath);

// Enable foreign keys & WAL mode for safer concurrent reads/writes
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function hasColumn(tableName: string, columnName: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return cols.some(c => c.name === columnName);
}

function ensureColumn(tableName: string, columnName: string, definition: string): void {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function getDbPath(): string {
  return dbPath;
}

export function getActiveDistrictId(): string {
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = 'active_district_id'").get() as { value: string } | undefined;
  return row?.value || process.env.DISTRICT_ID || DEFAULT_DISTRICT_ID;
}

export function setActiveDistrictId(districtId: string): void {
  db.prepare(`
    INSERT INTO sync_meta (key, value) VALUES ('active_district_id', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(districtId);
}

export function initDatabase() {
  console.log(`Initializing SQLite database at: ${dbPath}`);

  // Core multi-district & sync metadata tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS districts (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      state_name TEXT NOT NULL DEFAULT 'Andhra Pradesh',
      center_lat REAL NOT NULL DEFAULT 17.8167,
      center_lng REAL NOT NULL DEFAULT 83.3426,
      node_key_hash TEXT,
      status TEXT CHECK(status IN ('online', 'offline', 'provisioning')) NOT NULL DEFAULT 'offline',
      last_sync_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      district_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'synced', 'failed')) NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL,
      district_id TEXT NOT NULL DEFAULT 'd_eluru'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      badge_number TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('officer', 'dispatcher', 'state_admin')) NOT NULL,
      status TEXT CHECK(status IN ('Available', 'Patrolling', 'Assigned', 'Busy', 'Emergency', 'Lost Connection', 'Offline')) NOT NULL DEFAULT 'Offline',
      battery INTEGER DEFAULT 100,
      team_id TEXT,
      district_id TEXT NOT NULL DEFAULT 'd_eluru',
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
      district_id TEXT NOT NULL DEFAULT 'd_eluru',
      timestamp INTEGER NOT NULL,
      timeline TEXT NOT NULL,
      FOREIGN KEY(reporter_id) REFERENCES users(id),
      FOREIGN KEY(assignee_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT,
      team_id TEXT,
      district_id TEXT NOT NULL DEFAULT 'd_eluru',
      body TEXT NOT NULL,
      priority INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      is_broadcast INTEGER DEFAULT 0,
      FOREIGN KEY(sender_id) REFERENCES users(id),
      FOREIGN KEY(recipient_id) REFERENCES users(id),
      FOREIGN KEY(team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      officer_id TEXT NOT NULL,
      incident_id TEXT,
      district_id TEXT NOT NULL DEFAULT 'd_eluru',
      description TEXT,
      file_path TEXT NOT NULL,
      hash TEXT NOT NULL,
      hash_verified INTEGER NOT NULL DEFAULT 1,
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
      district_id TEXT NOT NULL DEFAULT 'd_eluru',
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
      district_id TEXT DEFAULT 'd_eluru',
      action TEXT NOT NULL,
      ip_address TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Non-destructive migration for existing databases created prior to multi-district & state_admin
  const usersSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined;
  if (usersSchema && !usersSchema.sql.includes('state_admin')) {
    console.log('Migrating users table to support state_admin role & district_id...');
    const hadDistrict = hasColumn('users', 'district_id');
    db.pragma('foreign_keys = OFF');
    const migrateTx = db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          badge_number TEXT UNIQUE NOT NULL,
          pin_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT CHECK(role IN ('officer', 'dispatcher', 'state_admin')) NOT NULL,
          status TEXT CHECK(status IN ('Available', 'Patrolling', 'Assigned', 'Busy', 'Emergency', 'Lost Connection', 'Offline')) NOT NULL DEFAULT 'Offline',
          battery INTEGER DEFAULT 100,
          team_id TEXT,
          district_id TEXT NOT NULL DEFAULT 'd_eluru',
          last_heartbeat INTEGER,
          FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL
        );
      `);
      if (hadDistrict) {
        db.exec(`
          INSERT INTO users_new (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
          SELECT id, badge_number, pin_hash, name, role, status, battery, team_id, COALESCE(district_id, 'd_eluru'), last_heartbeat FROM users;
        `);
      } else {
        db.exec(`
          INSERT INTO users_new (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
          SELECT id, badge_number, pin_hash, name, role, status, battery, team_id, 'd_eluru', last_heartbeat FROM users;
        `);
      }
      db.exec(`DROP TABLE users; ALTER TABLE users_new RENAME TO users;`);
    });
    migrateTx();
    db.pragma('foreign_keys = ON');
  }

  // Ensure district_id and verification columns exist on older tables
  ensureColumn('teams', 'district_id', "TEXT NOT NULL DEFAULT 'd_eluru'");
  ensureColumn('users', 'district_id', "TEXT NOT NULL DEFAULT 'd_eluru'");
  ensureColumn('incidents', 'district_id', "TEXT NOT NULL DEFAULT 'd_eluru'");
  ensureColumn('messages', 'district_id', "TEXT NOT NULL DEFAULT 'd_eluru'");
  ensureColumn('evidence', 'district_id', "TEXT NOT NULL DEFAULT 'd_eluru'");
  ensureColumn('evidence', 'hash_verified', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('devices', 'district_id', "TEXT NOT NULL DEFAULT 'd_eluru'");
  ensureColumn('audit_logs', 'district_id', "TEXT DEFAULT 'd_eluru'");

  // Helpful indexes for multi-district queries & cloud sync
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_district ON users(district_id, role);
    CREATE INDEX IF NOT EXISTS idx_incidents_district ON incidents(district_id, status, priority);
    CREATE INDEX IF NOT EXISTS idx_messages_district ON messages(district_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_evidence_district ON evidence(district_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_gps_officer_ts ON gps_logs(officer_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON cloud_sync_queue(status, created_at);
  `);

  // Seed default districts if empty
  const districtCount = db.prepare('SELECT COUNT(*) as count FROM districts').get() as { count: number };
  if (districtCount.count === 0) {
    console.log('Seeding initial districts...');
    const insertDistrict = db.prepare(`
      INSERT INTO districts (id, code, name, state_name, center_lat, center_lng, status, last_sync_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    insertDistrict.run(DEFAULT_DISTRICT_ID, 'ELR', 'Eluru District Hub', 'Andhra Pradesh', 16.7106, 81.0952, 'online', now, now);
    insertDistrict.run('d_vzg', 'VZG', 'Visakhapatnam District Hub', 'Andhra Pradesh', 17.6868, 83.2185, 'offline', null, now);
    insertDistrict.run('d_rjy', 'RJY', 'Rajahmundry District Hub', 'Andhra Pradesh', 17.0005, 81.8040, 'offline', null, now);
  }

  // Ensure active_district_id is initialized
  const activeMeta = db.prepare("SELECT value FROM sync_meta WHERE key = 'active_district_id'").get();
  if (!activeMeta) {
    setActiveDistrictId(process.env.DISTRICT_ID || DEFAULT_DISTRICT_ID);
  }

  // Seed default teams if empty
  const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
  if (teamCount.count === 0) {
    console.log('Seeding initial tactical teams...');
    const insertTeam = db.prepare('INSERT INTO teams (id, name, description, color, district_id) VALUES (?, ?, ?, ?, ?)');
    insertTeam.run('t1', 'Alpha Team', 'Frontline disaster rescue team', '#00E5FF', DEFAULT_DISTRICT_ID);
    insertTeam.run('t2', 'Bravo Team', 'Tactical perimeter containment team', '#FFD600', DEFAULT_DISTRICT_ID);
    insertTeam.run('t3', 'Charlie Team', 'Command backup & medical logistics', '#00E676', DEFAULT_DISTRICT_ID);
  }

  // Seed default users if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const defaultPinHash = bcrypt.hashSync(process.env.HERO_DEFAULT_PIN || 'police', 10);

  if (userCount.count === 0) {
    console.log('Seeding initial state_admin and district command accounts (0 officers by default)...');
    const insertUser = db.prepare(
      'INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    insertUser.run('u_state1', 'state_admin', defaultPinHash, 'AP State Command Admin', 'state_admin', 'Available', 100, null, DEFAULT_DISTRICT_ID, Date.now());
    insertUser.run('u_disp1', 'admin', defaultPinHash, 'Eluru Command Center', 'dispatcher', 'Available', 100, null, DEFAULT_DISTRICT_ID, Date.now());
  } else {
    // Ensure a state_admin exists on migrated databases
    const stateAdminExists = db.prepare("SELECT id FROM users WHERE role = 'state_admin' LIMIT 1").get();
    if (!stateAdminExists) {
      db.prepare(
        'INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('u_state1', 'state_admin', defaultPinHash, 'AP State Command Admin', 'state_admin', 'Available', 100, null, DEFAULT_DISTRICT_ID, Date.now());
    }
  }

  console.log('Database schema successfully migrated and seeded.');
}

export default db;
