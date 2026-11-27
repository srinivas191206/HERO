import crypto from 'crypto';
import db, { getActiveDistrictId, setActiveDistrictId } from '../../config/db';
import { CloudSyncQueueItem, District } from '../../types';

export interface DistrictProvisioningBundle {
  version: string;
  exportedAt: number;
  district: District;
  teams: Array<{
    id: string;
    name: string;
    description: string | null;
    color: string;
    districtId: string;
  }>;
  users: Array<{
    id: string;
    badgeNumber: string;
    pinHash: string;
    name: string;
    role: 'officer' | 'dispatcher' | 'state_admin';
    teamId: string | null;
    districtId: string;
  }>;
}

export interface SyncResult {
  success: boolean;
  pushedCount: number;
  pulledUpdates: number;
  cloudConfigured: boolean;
  lastSyncAt: number | null;
  error?: string;
}

export class CloudSyncService {
  private static syncTimer: NodeJS.Timeout | null = null;
  private static isSyncing = false;

  static getCloudConfig() {
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const districtNodeKey = process.env.DISTRICT_NODE_KEY || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const syncEndpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/district-sync` : '';

    return {
      supabaseUrl,
      syncEndpoint,
      districtNodeKey,
      supabaseAnonKey,
      supabaseServiceRoleKey,
      configured: Boolean(supabaseUrl && (districtNodeKey || supabaseServiceRoleKey))
    };
  }

  static enqueue(
    entityType: CloudSyncQueueItem['entityType'],
    entityId: string,
    districtId: string,
    payload: unknown
  ): void {
    try {
      db.prepare(`
        INSERT INTO cloud_sync_queue (id, entity_type, entity_id, district_id, payload, status, retry_count, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
      `).run(
        crypto.randomUUID(),
        entityType,
        entityId,
        districtId,
        JSON.stringify(payload),
        Date.now()
      );
    } catch (error) {
      console.error('[CloudSyncService] Failed to enqueue sync item:', error);
    }
  }

  static getStatus(districtId?: string) {
    const targetDistrict = districtId || getActiveDistrictId();
    const counts = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCount,
        SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as syncedCount
      FROM cloud_sync_queue
      WHERE district_id = ?
    `).get(targetDistrict) as { pendingCount: number | null; failedCount: number | null; syncedCount: number | null };

    const district = db.prepare(`
      SELECT id, code, name, status, last_sync_at as lastSyncAt
      FROM districts WHERE id = ?
    `).get(targetDistrict) as { id: string; code: string; name: string; status: string; lastSyncAt: number | null } | undefined;

    const config = this.getCloudConfig();

    return {
      districtId: targetDistrict,
      districtName: district?.name || targetDistrict,
      districtCode: district?.code || 'UNK',
      districtStatus: district?.status || 'offline',
      lastSyncAt: district?.lastSyncAt || null,
      pendingCount: counts?.pendingCount || 0,
      failedCount: counts?.failedCount || 0,
      syncedCount: counts?.syncedCount || 0,
      cloudConfigured: config.configured,
      syncEndpoint: config.syncEndpoint || null,
      availableDistricts: db.prepare('SELECT id, code, name, status, center_lat, center_lng FROM districts ORDER BY created_at ASC').all()
    };
  }

  /**
   * Pull all districts, teams, and users assigned in Supabase down to local SQLite
   * so officers created in State Cloud (/admin) can immediately log into this District Node.
   */
  static async pullAllFromCloud(): Promise<{ districts: number; teams: number; users: number }> {
    const config = this.getCloudConfig();
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      return { districts: 0, teams: 0, users: 0 };
    }

    const headers = {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json'
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const [distRes, teamsRes, usersRes] = await Promise.all([
        fetch(`${config.supabaseUrl}/rest/v1/districts?select=*`, { headers, signal: controller.signal }),
        fetch(`${config.supabaseUrl}/rest/v1/teams?select=*`, { headers, signal: controller.signal }),
        fetch(`${config.supabaseUrl}/rest/v1/users?select=*`, { headers, signal: controller.signal })
      ]);

      clearTimeout(timeout);

      const districts = distRes.ok ? ((await distRes.json()) as any[]) : [];
      const teams = teamsRes.ok ? ((await teamsRes.json()) as any[]) : [];
      const users = usersRes.ok ? ((await usersRes.json()) as any[]) : [];

      const tx = db.transaction(() => {
        for (const d of districts) {
          db.prepare(`
            INSERT INTO districts (id, code, name, state_name, center_lat, center_lng, node_key_hash, status, last_sync_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              code = excluded.code,
              name = excluded.name,
              state_name = excluded.state_name,
              center_lat = excluded.center_lat,
              center_lng = excluded.center_lng
          `).run(
            d.id,
            d.code,
            d.name,
            d.state_name || 'Andhra Pradesh',
            d.center_lat ?? 17.6868,
            d.center_lng ?? 83.2185,
            d.node_key_hash || null,
            d.status || 'offline',
            d.last_sync_at || null,
            d.created_at || Date.now()
          );
        }

        for (const t of teams) {
          db.prepare(`
            INSERT INTO teams (id, name, description, color, district_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              color = excluded.color,
              district_id = excluded.district_id
          `).run(t.id, t.name, t.description || '', t.color || '#0284C7', t.district_id);
        }

        for (const u of users) {
          // Ensure badge_number uniqueness does not fail if a local row has a different id
          db.prepare('DELETE FROM users WHERE LOWER(badge_number) = LOWER(?) AND id != ?').run(u.badge_number, u.id);
          db.prepare(`
            INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
            VALUES (?, ?, ?, ?, ?, 'Offline', 100, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              badge_number = excluded.badge_number,
              pin_hash = excluded.pin_hash,
              name = excluded.name,
              role = excluded.role,
              team_id = excluded.team_id,
              district_id = excluded.district_id
          `).run(
            u.id,
            u.badge_number,
            u.pin_hash,
            u.name,
            u.role,
            u.team_id || null,
            u.district_id || 'd_eluru',
            u.last_heartbeat || Date.now()
          );
        }
      });

      tx();
      console.log(`[CloudSyncService] Pulled from Supabase: ${districts.length} districts, ${teams.length} teams, ${users.length} users`);
      return { districts: districts.length, teams: teams.length, users: users.length };
    } catch (err) {
      clearTimeout(timeout);
      return { districts: 0, teams: 0, users: 0 };
    }
  }

  /**
   * Export a self-contained District Provisioning Bundle (.json) from the database.
   * Allows a staging laptop to pre-load a district roster before heading into an offline zone.
   */
  static exportDistrictBundle(districtId: string): DistrictProvisioningBundle | null {
    const district = db.prepare(`
      SELECT id, code, name, state_name as stateName, center_lat as centerLat, center_lng as centerLng,
             status, last_sync_at as lastSyncAt, created_at as createdAt
      FROM districts WHERE id = ?
    `).get(districtId) as District | undefined;

    if (!district) return null;

    const teams = db.prepare(`
      SELECT id, name, description, color, district_id as districtId
      FROM teams WHERE district_id = ?
    `).all(districtId) as DistrictProvisioningBundle['teams'];

    const users = db.prepare(`
      SELECT id, badge_number as badgeNumber, pin_hash as pinHash, name, role,
             team_id as teamId, district_id as districtId
      FROM users WHERE district_id = ? OR role = 'state_admin'
    `).all(districtId) as DistrictProvisioningBundle['users'];

    return {
      version: '1.0',
      exportedAt: Date.now(),
      district,
      teams,
      users
    };
  }

  /**
   * Import a District Provisioning Bundle onto a local District Node (Electron/Node)
   * and switch the node's active district ID to it.
   */
  static importDistrictBundle(bundle: DistrictProvisioningBundle): { importedUsers: number; importedTeams: number; districtId: string } {
    if (!bundle?.district?.id || !bundle.district.name) {
      throw new Error('Invalid district provisioning bundle.');
    }

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO districts (id, code, name, state_name, center_lat, center_lng, status, last_sync_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'online', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          name = excluded.name,
          state_name = excluded.state_name,
          center_lat = excluded.center_lat,
          center_lng = excluded.center_lng
      `).run(
        bundle.district.id,
        bundle.district.code,
        bundle.district.name,
        bundle.district.stateName || 'Andhra Pradesh',
        bundle.district.centerLat ?? 17.6868,
        bundle.district.centerLng ?? 83.2185,
        bundle.district.lastSyncAt ?? Date.now(),
        bundle.district.createdAt ?? Date.now()
      );

      for (const team of bundle.teams || []) {
        db.prepare(`
          INSERT INTO teams (id, name, description, color, district_id)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            color = excluded.color,
            district_id = excluded.district_id
        `).run(team.id, team.name, team.description || '', team.color || '#0284C7', bundle.district.id);
      }

      for (const usr of bundle.users || []) {
        db.prepare(`
          INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
          VALUES (?, ?, ?, ?, ?, 'Offline', 100, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            badge_number = excluded.badge_number,
            pin_hash = excluded.pin_hash,
            name = excluded.name,
            role = excluded.role,
            team_id = excluded.team_id,
            district_id = excluded.district_id
        `).run(
          usr.id,
          usr.badgeNumber,
          usr.pinHash,
          usr.name,
          usr.role,
          usr.teamId || null,
          usr.role === 'state_admin' ? usr.districtId : bundle.district.id,
          Date.now()
        );
      }

      setActiveDistrictId(bundle.district.id);
    });

    tx();

    return {
      districtId: bundle.district.id,
      importedTeams: bundle.teams?.length || 0,
      importedUsers: bundle.users?.length || 0
    };
  }

  /**
   * Push queued offline records to the State Supabase Edge Function and pull updates.
   * Safe when offline: leaves items queued and marks district status as offline.
   */
  static async syncNow(districtId?: string): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        pushedCount: 0,
        pulledUpdates: 0,
        cloudConfigured: this.getCloudConfig().configured,
        lastSyncAt: null,
        error: 'Sync already in progress.'
      };
    }

    const targetDistrict = districtId || getActiveDistrictId();
    const config = this.getCloudConfig();

    if (!config.configured) {
      return {
        success: false,
        pushedCount: 0,
        pulledUpdates: 0,
        cloudConfigured: false,
        lastSyncAt: null,
        error: 'Cloud sync not configured (set SUPABASE_URL and DISTRICT_NODE_KEY).'
      };
    }

    this.isSyncing = true;

    try {
      const pendingItems = db.prepare(`
        SELECT id, entity_type as entityType, entity_id as entityId, district_id as districtId,
               payload, status, retry_count as retryCount, created_at as createdAt
        FROM cloud_sync_queue
        WHERE district_id = ? AND status = 'pending' AND retry_count < 10
        ORDER BY created_at ASC
        LIMIT 100
      `).all(targetDistrict) as CloudSyncQueueItem[];

      // Include current officer telemetry snapshot so State portal sees accurate force availability
      const officers = db.prepare(`
        SELECT u.id, u.badge_number as badgeNumber, u.pin_hash as pinHash, u.name, u.role, u.status, u.battery,
               u.team_id as teamId, u.district_id as districtId, u.last_heartbeat as lastHeartbeat
        FROM users u
        WHERE u.district_id = ? AND u.role = 'officer'
      `).all(targetDistrict) as any[];

      const officerSnapshots = officers.map(off => {
        const lastGps = db.prepare(`
          SELECT latitude, longitude, timestamp FROM gps_logs
          WHERE officer_id = ? ORDER BY timestamp DESC LIMIT 1
        `).get(off.id) as { latitude: number; longitude: number; timestamp: number } | undefined;
        return { ...off, location: lastGps || null };
      });

      const district = db.prepare(`
        SELECT id, code, name, state_name as stateName, center_lat as centerLat, center_lng as centerLng, last_sync_at as lastSyncAt
        FROM districts WHERE id = ?
      `).get(targetDistrict) as any;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let result: {
        ok: boolean;
        serverTimestamp?: number;
        syncedQueueIds?: string[];
        rosterUpdates?: { teams?: DistrictProvisioningBundle['teams']; users?: DistrictProvisioningBundle['users'] };
      };

      if (config.districtNodeKey) {
        const response = await fetch(config.syncEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.supabaseAnonKey ? { Authorization: `Bearer ${config.supabaseAnonKey}` } : {}),
            'x-district-node-key': config.districtNodeKey
          },
          body: JSON.stringify({
            districtId: targetDistrict,
            district,
            lastSyncAt: district?.lastSyncAt || 0,
            items: pendingItems.map(item => ({
              queueId: item.id,
              entityType: item.entityType,
              entityId: item.entityId,
              payload: JSON.parse(item.payload),
              createdAt: item.createdAt
            })),
            officerSnapshots
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }
        result = await response.json();
      } else {
        // Direct server-side Supabase REST sync using SUPABASE_SERVICE_ROLE_KEY
        const restHeaders = {
          apikey: config.supabaseServiceRoleKey,
          Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        };

        const postgrestUpsert = async (table: string, rows: any[]) => {
          if (!rows.length) return;
          const res = await fetch(`${config.supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
            method: 'POST',
            headers: restHeaders,
            body: JSON.stringify(rows),
            signal: controller.signal
          });
          if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Supabase ${table} upsert failed (${res.status}): ${errTxt}`);
          }
        };

        const nowTs = Date.now();
        if (district) {
          await postgrestUpsert('districts', [
            {
              id: district.id,
              code: district.code,
              name: district.name,
              state_name: district.stateName || 'Andhra Pradesh',
              center_lat: district.centerLat,
              center_lng: district.centerLng,
              status: 'online',
              last_sync_at: nowTs
            }
          ]);
        }

        const incidentRows: any[] = [];
        const messageRows: any[] = [];
        const evidenceRows: any[] = [];
        const auditRows: any[] = [];

        for (const item of pendingItems) {
          const p = JSON.parse(item.payload);
          if (item.entityType === 'incident') {
            incidentRows.push({
              id: p.id,
              district_id: targetDistrict,
              title: p.title,
              description: p.description ?? '',
              priority: p.priority,
              status: p.status,
              location_lat: p.locationLat ?? null,
              location_lng: p.locationLng ?? null,
              reporter_id: p.reporterId,
              assignee_id: p.assigneeId ?? null,
              timestamp: p.timestamp,
              timeline: typeof p.timeline === 'string' ? JSON.parse(p.timeline) : p.timeline || []
            });
          } else if (item.entityType === 'message') {
            messageRows.push({
              id: p.id,
              district_id: targetDistrict,
              sender_id: p.senderId,
              recipient_id: p.recipientId ?? null,
              team_id: p.teamId ?? null,
              body: p.body,
              priority: p.priority ?? 5,
              timestamp: p.timestamp,
              is_broadcast: Boolean(p.isBroadcast)
            });
          } else if (item.entityType === 'evidence') {
            evidenceRows.push({
              id: p.id,
              district_id: targetDistrict,
              officer_id: p.officerId,
              incident_id: p.incidentId ?? null,
              description: p.description ?? '',
              file_path: p.filePath ?? null,
              hash: p.hash,
              hash_verified: Boolean(p.hashVerified),
              location_lat: p.locationLat ?? null,
              location_lng: p.locationLng ?? null,
              timestamp: p.timestamp
            });
          } else if (item.entityType === 'audit') {
            auditRows.push({
              id: p.id,
              district_id: targetDistrict,
              user_id: p.userId ?? null,
              action: p.action,
              ip_address: p.ipAddress ?? null,
              timestamp: p.timestamp
            });
          }
        }

        await postgrestUpsert('incidents', incidentRows);
        await postgrestUpsert('messages', messageRows);
        await postgrestUpsert('evidence', evidenceRows);
        await postgrestUpsert('audit_logs', auditRows);

        if (officerSnapshots.length > 0) {
          const offRows = officerSnapshots.map((off: any) => ({
            id: off.id,
            badge_number: off.badgeNumber,
            pin_hash: off.pinHash || 'synced_node',
            name: off.name,
            role: off.role || 'officer',
            status: off.status,
            battery: off.battery ?? 100,
            team_id: off.teamId ?? null,
            district_id: targetDistrict,
            last_heartbeat: off.lastHeartbeat ?? nowTs,
            last_lat: off.location?.latitude ?? null,
            last_lng: off.location?.longitude ?? null
          }));
          await postgrestUpsert('users', offRows);
        }

        // Also pull all cloud districts/teams/users so cross-district deployments stay synced
        await this.pullAllFromCloud();
        clearTimeout(timeout);
        result = {
          ok: true,
          serverTimestamp: nowTs,
          syncedQueueIds: pendingItems.map(i => i.id),
          rosterUpdates: { teams: [], users: [] }
        };
      }

      const now = result.serverTimestamp || Date.now();
      const syncedIds = result.syncedQueueIds || pendingItems.map(i => i.id);

      const markTx = db.transaction(() => {
        const markSynced = db.prepare("UPDATE cloud_sync_queue SET status = 'synced', synced_at = ? WHERE id = ?");
        for (const qId of syncedIds) {
          markSynced.run(now, qId);
        }

        db.prepare("UPDATE districts SET status = 'online', last_sync_at = ? WHERE id = ?").run(now, targetDistrict);

        // Apply any downstream roster assignments pushed from State Admin
        if (result.rosterUpdates?.teams) {
          for (const t of result.rosterUpdates.teams) {
            db.prepare(`
              INSERT INTO teams (id, name, description, color, district_id)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, color = excluded.color
            `).run(t.id, t.name, t.description || '', t.color || '#0284C7', targetDistrict);
          }
        }
        if (result.rosterUpdates?.users) {
          for (const u of result.rosterUpdates.users) {
            db.prepare(`
              INSERT INTO users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
              VALUES (?, ?, ?, ?, ?, 'Offline', 100, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                badge_number = excluded.badge_number,
                pin_hash = excluded.pin_hash,
                name = excluded.name,
                role = excluded.role,
                team_id = excluded.team_id
            `).run(u.id, u.badgeNumber, u.pinHash, u.name, u.role, u.teamId || null, targetDistrict, now);
          }
        }
      });

      markTx();

      return {
        success: true,
        pushedCount: syncedIds.length,
        pulledUpdates: (result.rosterUpdates?.teams?.length || 0) + (result.rosterUpdates?.users?.length || 0),
        cloudConfigured: true,
        lastSyncAt: now
      };
    } catch (error: any) {
      db.prepare("UPDATE districts SET status = 'offline' WHERE id = ?").run(targetDistrict);
      return {
        success: false,
        pushedCount: 0,
        pulledUpdates: 0,
        cloudConfigured: true,
        lastSyncAt: null,
        error: error?.message || 'Cloud unreachable (operating in offline local mode).'
      };
    } finally {
      this.isSyncing = false;
    }
  }

  static startAutoSync(intervalMs: number = 20000): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      if (this.getCloudConfig().configured) {
        this.syncNow().catch(() => {});
      }
    }, intervalMs);
  }

  static stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

