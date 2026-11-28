import { DistrictSummary, User, Incident, AuditLog, Message } from '../../types';
import { safeRandomUUID } from '../../utils/uuid';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

async function sha256Hex(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('Secure WebCrypto context required to hash district node key.');
}

function randomHexKey(bytesLength = 16): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint8Array(bytesLength);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return safeRandomUUID().replace(/-/g, '');
}

export class SupabaseSessionExpiredError extends Error {
  constructor(message = 'Supabase session expired. Please sign in again.') {
    super(message);
    this.name = 'SupabaseSessionExpiredError';
  }
}

let inFlightRefresh: Promise<string | null> | null = null;

export class SupabaseStateClient {
  static isConfigured(): boolean {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  static isJwtExpired(token?: string | null, bufferSeconds = 30): boolean {
    if (!token) return true;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      if (!payload?.exp) return false;
      return Date.now() / 1000 >= payload.exp - bufferSeconds;
    } catch {
      return false;
    }
  }

  static async refreshSession(): Promise<string | null> {
    if (typeof window === 'undefined' || !this.isConfigured()) return null;
    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
      try {
        const refreshToken = localStorage.getItem('hero_refresh_token');
        if (!refreshToken) return null;

        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!res.ok) return null;

        const data = await res.json();
        const nextAccess = data?.access_token as string | undefined;
        const nextRefresh = data?.refresh_token as string | undefined;
        if (!nextAccess) return null;

        localStorage.setItem('tactical_token', nextAccess);
        if (nextRefresh) localStorage.setItem('hero_refresh_token', nextRefresh);
        window.dispatchEvent(new CustomEvent('hero:token-refreshed', { detail: { token: nextAccess } }));
        return nextAccess;
      } catch {
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  }

  private static async authedFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
    let activeToken = accessToken;
    if (this.isJwtExpired(activeToken)) {
      const refreshed = await this.refreshSession();
      if (!refreshed) {
        throw new SupabaseSessionExpiredError();
      }
      activeToken = refreshed;
    }

    const doFetch = (tok: string) =>
      fetch(url, {
        ...init,
        headers: {
          ...this.headers(tok),
          ...(init.headers as Record<string, string> | undefined)
        }
      });

    let res = await doFetch(activeToken);
    if (res.status === 401) {
      const refreshed = await this.refreshSession();
      if (!refreshed) {
        throw new SupabaseSessionExpiredError();
      }
      res = await doFetch(refreshed);
    }
    return res;
  }

  static getConnectionMode(): 'local' | 'cloud' {
    if (typeof window === 'undefined') return 'local';
    const saved = localStorage.getItem('hero_connection_mode');
    if (saved === 'cloud' || saved === 'local') return saved;
    // On HTTPS public hosting (e.g. Vercel) default to cloud Supabase mode
    if (window.location.protocol === 'https:' && this.isConfigured()) {
      return 'cloud';
    }
    return 'local';
  }

  static setConnectionMode(mode: 'local' | 'cloud') {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hero_connection_mode', mode);
    }
  }

  private static headers(accessToken?: string): Record<string, string> {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  static async signInWithEmail(email: string, password: string): Promise<{ token: string; user: User }> {
    if (!this.isConfigured()) {
      throw new Error('Supabase URL / Anon key not configured.');
    }

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email: email.trim(), password })
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
      throw new Error(authData.error_description || authData.msg || 'Supabase authentication failed.');
    }

    const accessToken = authData.access_token as string;
    const refreshToken = authData.refresh_token as string | undefined;
    const authUserId = authData.user?.id as string;

    if (typeof window !== 'undefined' && refreshToken) {
      try {
        localStorage.setItem('hero_refresh_token', refreshToken);
      } catch {}
    }

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?auth_user_id=eq.${encodeURIComponent(authUserId)}&select=id,badge_number,name,role,status,battery,team_id,district_id`,
      { headers: this.headers(accessToken) }
    );

    if (!profileRes.ok) {
      throw new Error('Failed to load State Admin profile from Supabase.');
    }

    const profiles = await profileRes.json();
    const row = profiles?.[0];
    if (!row) {
      throw new Error('Account authenticated, but not linked as state_admin in public.users. Run supabase/seed.sql first.');
    }

    const user: User = {
      id: row.id,
      badgeNumber: row.badge_number,
      name: row.name,
      role: row.role,
      status: row.status,
      battery: row.battery ?? 100,
      teamId: row.team_id,
      districtId: row.district_id,
      districtName: 'Andhra Pradesh State HQ',
      districtCode: 'STATE'
    };

    return { token: accessToken, user };
  }

  static async fetchStateOverview(accessToken: string): Promise<DistrictSummary[]> {
    const [distRes, usersRes, incRes] = await Promise.all([
      this.authedFetch(`${SUPABASE_URL}/rest/v1/districts?select=*&order=created_at.asc`, accessToken),
      this.authedFetch(`${SUPABASE_URL}/rest/v1/users?select=id,district_id,role,status`, accessToken),
      this.authedFetch(`${SUPABASE_URL}/rest/v1/incidents?select=id,district_id,priority,status`, accessToken)
    ]);

    if (!distRes.ok) {
      if (distRes.status === 401) throw new SupabaseSessionExpiredError();
      throw new Error(`Failed to load districts from Supabase (HTTP ${distRes.status}).`);
    }
    const districts = await distRes.json();
    const users = usersRes.ok ? await usersRes.json() : [];
    const incidents = incRes.ok ? await incRes.json() : [];

    return districts.map((d: any) => {
      const distOfficers = users.filter((u: any) => u.district_id === d.id && u.role === 'officer');
      const activeInc = incidents.filter((i: any) => i.district_id === d.id && i.status !== 'Closed' && i.status !== 'Resolved');

      return {
        id: d.id,
        code: d.code,
        name: d.name,
        stateName: d.state_name,
        centerLat: d.center_lat,
        centerLng: d.center_lng,
        status: d.status,
        lastSyncAt: d.last_sync_at,
        createdAt: d.created_at,
        totalOfficers: distOfficers.length,
        onlineOfficers: distOfficers.filter((u: any) => u.status !== 'Offline' && u.status !== 'Lost Connection').length,
        sosCount: distOfficers.filter((u: any) => u.status === 'Emergency').length,
        activeIncidents: activeInc.length,
        p1Count: activeInc.filter((i: any) => i.priority === 'P1').length,
        pendingSyncCount: 0
      };
    });
  }

  static async createDistrict(
    accessToken: string,
    input: { name: string; code: string; stateName: string; centerLat: number; centerLng: number }
  ) {
    const cleanCode = input.code.trim().toUpperCase();
    const id = `d_${cleanCode.toLowerCase()}_${safeRandomUUID().slice(0, 6)}`;
    const now = Date.now();
    const plainNodeKey = `hk_${randomHexKey(16)}`;
    const nodeKeyHash = await sha256Hex(plainNodeKey);

    const res = await this.authedFetch(`${SUPABASE_URL}/rest/v1/districts`, accessToken, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id,
        code: cleanCode,
        name: input.name.trim(),
        state_name: input.stateName.trim() || 'Andhra Pradesh',
        center_lat: input.centerLat,
        center_lng: input.centerLng,
        node_key_hash: nodeKeyHash,
        status: 'provisioning',
        last_sync_at: null,
        created_at: now
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create district in Supabase.');
    }

    // Seed default Alpha/Bravo teams in Supabase for this district
    await fetch(`${SUPABASE_URL}/rest/v1/teams`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify([
        { id: `${id}_t1`, district_id: id, name: 'Alpha Team', description: `${input.name} Frontline Rescue`, color: '#00E5FF' },
        { id: `${id}_t2`, district_id: id, name: 'Bravo Team', description: `${input.name} Perimeter Containment`, color: '#FFD600' }
      ])
    });

    const created = (await res.json())?.[0];
    return {
      district: {
        id: created?.id || id,
        code: cleanCode,
        name: input.name.trim(),
        stateName: input.stateName.trim() || 'Andhra Pradesh',
        centerLat: input.centerLat,
        centerLng: input.centerLng,
        status: 'provisioning',
        lastSyncAt: null,
        createdAt: now
      },
      nodeKey: plainNodeKey
    };
  }

  static async assignUser(
    accessToken: string,
    input: { badgeNumber: string; name: string; pin: string; role: 'officer' | 'dispatcher'; districtId: string; teamId?: string | null }
  ) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/assign_district_user`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({
        p_badge_number: input.badgeNumber.trim(),
        p_name: input.name.trim(),
        p_pin: input.pin,
        p_role: input.role,
        p_district_id: input.districtId,
        p_team_id: input.teamId ?? null
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || 'Failed to assign user in Supabase.');
    }
    return data;
  }

  static async batchDeployOfficers(
    accessToken: string,
    input: { districtId: string; count: number; prefix?: string; defaultPin?: string }
  ) {
    const count = Math.max(1, Math.min(50, Math.floor(input.count)));
    const defaultPin = input.defaultPin?.trim() || 'police';

    const [distRes, teamsRes, usersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/districts?id=eq.${encodeURIComponent(input.districtId)}&select=id,code,name`, {
        headers: this.headers(accessToken)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/teams?district_id=eq.${encodeURIComponent(input.districtId)}&select=id,name`, {
        headers: this.headers(accessToken)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/users?select=badge_number`, {
        headers: this.headers(accessToken)
      })
    ]);

    const district = (await distRes.json())?.[0];
    if (!district) throw new Error('Target district not found in Supabase.');
    const teams: Array<{ id: string; name: string }> = teamsRes.ok ? await teamsRes.json() : [];
    const existingBadges = new Set<string>(
      ((usersRes.ok ? await usersRes.json() : []) as Array<{ badge_number: string }>).map(u =>
        u.badge_number.toLowerCase()
      )
    );

    const basePrefix = input.prefix?.trim()
      ? input.prefix.trim().toLowerCase()
      : input.districtId === 'd_eluru'
        ? 'p'
        : `${String(district.code).toLowerCase()}_p`;

    const created: Array<{
      id: string;
      badgeNumber: string;
      name: string;
      pin: string;
      role: 'officer';
      teamId: string | null;
      teamName: string;
      districtId: string;
    }> = [];

    let seq = 1;
    for (let i = 0; i < count; i++) {
      while (existingBadges.has(`${basePrefix}${seq}`.toLowerCase())) {
        seq++;
      }
      const badgeNumber = `${basePrefix}${seq}`;
      existingBadges.add(badgeNumber.toLowerCase());
      const team = teams.length > 0 ? teams[i % teams.length] : null;
      const name = `${district.code} Officer ${seq}`;

      const assigned = await this.assignUser(accessToken, {
        badgeNumber,
        name,
        pin: defaultPin,
        role: 'officer',
        districtId: input.districtId,
        teamId: team?.id || null
      });

      created.push({
        id: assigned.id,
        badgeNumber,
        name,
        pin: defaultPin,
        role: 'officer',
        teamId: team?.id || null,
        teamName: team?.name || 'Unassigned',
        districtId: input.districtId
      });
      seq++;
    }

    return created;
  }

  static async exportDistrictBundle(accessToken: string, districtId: string) {
    const [distRes, teamsRes, usersRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/districts?id=eq.${encodeURIComponent(districtId)}&select=*`, {
        headers: this.headers(accessToken)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/teams?district_id=eq.${encodeURIComponent(districtId)}&select=*`, {
        headers: this.headers(accessToken)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/users?or=(district_id.eq.${encodeURIComponent(districtId)},role.eq.state_admin)&select=*`, {
        headers: this.headers(accessToken)
      })
    ]);

    const dist = (await distRes.json())?.[0];
    if (!dist) throw new Error('District not found.');
    const teams = await teamsRes.json();
    const users = await usersRes.json();

    return {
      version: '1.0',
      exportedAt: Date.now(),
      district: {
        id: dist.id,
        code: dist.code,
        name: dist.name,
        stateName: dist.state_name,
        centerLat: dist.center_lat,
        centerLng: dist.center_lng,
        status: dist.status,
        lastSyncAt: dist.last_sync_at,
        createdAt: dist.created_at
      },
      teams: (teams || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        color: t.color,
        districtId: t.district_id
      })),
      users: (users || []).map((u: any) => ({
        id: u.id,
        badgeNumber: u.badge_number,
        pinHash: u.pin_hash,
        name: u.name,
        role: u.role,
        teamId: u.team_id,
        districtId: u.district_id
      }))
    };
  }

  static async fetchDistrictSnapshot(accessToken: string, districtId: string): Promise<{
    district: any;
    officers: User[];
    incidents: Incident[];
    auditLogs: AuditLog[];
    messages: Message[];
    evidence: any[];
  }> {
    const q = encodeURIComponent(districtId);
    const [distRes, offRes, incRes, audRes, msgRes, evRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/districts?id=eq.${q}&select=*`, { headers: this.headers(accessToken) }),
      fetch(`${SUPABASE_URL}/rest/v1/users?district_id=eq.${q}&role=eq.officer&select=*`, { headers: this.headers(accessToken) }),
      fetch(`${SUPABASE_URL}/rest/v1/incidents?district_id=eq.${q}&status=neq.Closed&order=priority.asc,timestamp.desc`, {
        headers: this.headers(accessToken)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/audit_logs?district_id=eq.${q}&order=timestamp.desc&limit=50`, {
        headers: this.headers(accessToken)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/messages?district_id=eq.${q}&order=timestamp.asc`, {
        headers: this.headers(accessToken)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/evidence?district_id=eq.${q}&order=timestamp.desc`, {
        headers: this.headers(accessToken)
      })
    ]);

    const dist = (await distRes.json())?.[0];
    const officersRaw = offRes.ok ? await offRes.json() : [];
    const incRaw = incRes.ok ? await incRes.json() : [];
    const audRaw = audRes.ok ? await audRes.json() : [];
    const msgRaw = msgRes.ok ? await msgRes.json() : [];
    const evRaw = evRes.ok ? await evRes.json() : [];

    return {
      district: dist,
      officers: officersRaw.map((u: any) => ({
        id: u.id,
        badgeNumber: u.badge_number,
        name: u.name,
        role: u.role,
        status: u.status,
        battery: u.battery,
        teamId: u.team_id,
        districtId: u.district_id,
        lastHeartbeat: u.last_heartbeat,
        location: u.last_lat != null && u.last_lng != null
          ? { latitude: u.last_lat, longitude: u.last_lng, timestamp: u.last_heartbeat || Date.now() }
          : null
      })),
      incidents: incRaw.map((i: any) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        priority: i.priority,
        status: i.status,
        locationLat: i.location_lat,
        locationLng: i.location_lng,
        reporterId: i.reporter_id,
        assigneeId: i.assignee_id,
        districtId: i.district_id,
        timestamp: i.timestamp,
        timeline: typeof i.timeline === 'string' ? i.timeline : JSON.stringify(i.timeline || [])
      })),
      auditLogs: audRaw.map((a: any) => ({
        id: a.id,
        userId: a.user_id,
        districtId: a.district_id,
        action: a.action,
        ipAddress: a.ip_address,
        timestamp: a.timestamp
      })),
      messages: msgRaw.map((m: any) => ({
        id: m.id,
        senderId: m.sender_id,
        recipientId: m.recipient_id,
        teamId: m.team_id,
        districtId: m.district_id,
        body: m.body,
        priority: m.priority,
        timestamp: m.timestamp,
        isBroadcast: Boolean(m.is_broadcast)
      })),
      evidence: evRaw.map((e: any) => ({
        id: e.id,
        officerId: e.officer_id,
        incidentId: e.incident_id,
        districtId: e.district_id,
        description: e.description,
        filePath: e.file_path,
        hash: e.hash,
        hashVerified: Boolean(e.hash_verified),
        locationLat: e.location_lat,
        locationLng: e.location_lng,
        timestamp: e.timestamp
      }))
    };
  }

  static async fetchStateOperationsSnapshot(accessToken: string): Promise<{
    districts: DistrictSummary[];
    incidents: Incident[];
    officers: User[];
    auditLogs: AuditLog[];
    health: {
      status: 'Operational' | 'Degraded' | 'Offline';
      cloudConfigured: boolean;
      latencyMs: number;
      pendingSyncTotal: number;
      failedSyncTotal: number;
      syncedTotal: number;
      timestamp: number;
    };
  }> {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;

    const [distRes, usersRes, incRes, audRes] = await Promise.all([
      this.authedFetch(`${SUPABASE_URL}/rest/v1/districts?select=*&order=created_at.asc`, accessToken),
      this.authedFetch(
        `${SUPABASE_URL}/rest/v1/users?select=id,badge_number,name,role,status,battery,team_id,district_id,last_heartbeat,last_lat,last_lng`,
        accessToken
      ),
      this.authedFetch(
        `${SUPABASE_URL}/rest/v1/incidents?or=(timestamp.gte.${cutoff48h},status.not.in.(Closed,Resolved))&select=*&order=timestamp.desc&limit=300`,
        accessToken
      ),
      this.authedFetch(`${SUPABASE_URL}/rest/v1/audit_logs?select=*&order=timestamp.desc&limit=50`, accessToken)
    ]);

    if (!distRes.ok) {
      if (distRes.status === 401) throw new SupabaseSessionExpiredError();
      throw new Error(`Failed to load districts from Supabase (HTTP ${distRes.status}).`);
    }

    const latencyMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
    );

    const districtsRaw = await distRes.json();
    const usersRaw = usersRes.ok ? await usersRes.json() : [];
    const incRaw = incRes.ok ? await incRes.json() : [];
    const audRaw = audRes.ok ? await audRes.json() : [];

    const allOk = distRes.ok && usersRes.ok && incRes.ok && audRes.ok;

    const districts: DistrictSummary[] = (districtsRaw || []).map((d: any) => {
      const distOfficers = (usersRaw || []).filter((u: any) => u.district_id === d.id && u.role === 'officer');
      const activeInc = (incRaw || []).filter(
        (i: any) => i.district_id === d.id && i.status !== 'Closed' && i.status !== 'Resolved'
      );
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        stateName: d.state_name,
        centerLat: d.center_lat,
        centerLng: d.center_lng,
        status: d.status,
        lastSyncAt: d.last_sync_at,
        createdAt: d.created_at,
        totalOfficers: distOfficers.length,
        onlineOfficers: distOfficers.filter(
          (u: any) => u.status !== 'Offline' && u.status !== 'Lost Connection'
        ).length,
        sosCount: distOfficers.filter((u: any) => u.status === 'Emergency').length,
        activeIncidents: activeInc.length,
        p1Count: activeInc.filter((i: any) => i.priority === 'P1').length,
        pendingSyncCount: 0
      };
    });

    const incidents: Incident[] = (incRaw || []).map((i: any) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      priority: i.priority,
      status: i.status,
      locationLat: i.location_lat ?? null,
      locationLng: i.location_lng ?? null,
      reporterId: i.reporter_id,
      assigneeId: i.assignee_id,
      districtId: i.district_id,
      timestamp: Number(i.timestamp),
      timeline: typeof i.timeline === 'string' ? i.timeline : JSON.stringify(i.timeline || [])
    }));

    const officers: User[] = (usersRaw || [])
      .filter((u: any) => u.role === 'officer')
      .map((u: any) => ({
        id: u.id,
        badgeNumber: u.badge_number,
        name: u.name,
        role: u.role,
        status: u.status,
        battery: u.battery ?? 100,
        teamId: u.team_id,
        districtId: u.district_id,
        lastHeartbeat: u.last_heartbeat,
        location:
          u.last_lat != null && u.last_lng != null
            ? {
                latitude: u.last_lat,
                longitude: u.last_lng,
                timestamp: u.last_heartbeat || Date.now()
              }
            : null
      }));

    const auditLogs: AuditLog[] = (audRaw || []).map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      districtId: a.district_id,
      action: a.action,
      ipAddress: a.ip_address,
      timestamp: Number(a.timestamp)
    }));

    return {
      districts,
      incidents,
      officers,
      auditLogs,
      health: {
        status: allOk ? 'Operational' : 'Degraded',
        cloudConfigured: this.isConfigured(),
        latencyMs,
        pendingSyncTotal: 0,
        failedSyncTotal: allOk ? 0 : 1,
        syncedTotal: districts.filter(d => d.status === 'online').length,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Lightweight Supabase Realtime WebSocket subscription (Phoenix channel)
   * subscribing to state-wide postgres_changes without requiring @supabase/supabase-js.
   */
  static subscribeStateRealtime(
    accessToken: string,
    onTableChange: (table: string) => void
  ): () => void {
    if (typeof window === 'undefined' || !this.isConfigured() || !accessToken) {
      return () => {};
    }

    let closed = false;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let ws: WebSocket | null = null;
    let refCounter = 1;

    try {
      const wsBase = SUPABASE_URL.replace(/^http/i, 'ws');
      const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}&vsn=1.0.0`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (closed || !ws) return;
        const topic = 'realtime:state-ops';
        ws.send(
          JSON.stringify({
            topic,
            event: 'phx_join',
            payload: {
              config: {
                postgres_changes: [
                  { event: '*', schema: 'public', table: 'districts' },
                  { event: '*', schema: 'public', table: 'incidents' },
                  { event: '*', schema: 'public', table: 'users' },
                  { event: '*', schema: 'public', table: 'audit_logs' }
                ]
              },
              access_token: accessToken
            },
            ref: String(refCounter++)
          })
        );

        heartbeatId = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(refCounter++) }));
          }
        }, 25000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.event === 'postgres_changes') {
            const tbl = msg?.payload?.data?.table || msg?.payload?.table || 'unknown';
            onTableChange(tbl);
          }
        } catch {}
      };
    } catch {
      // Silently degrade to manual/periodic refresh
    }

    return () => {
      closed = true;
      if (heartbeatId) clearInterval(heartbeatId);
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };
  }
}

