// Supabase Edge Function: district-sync
// Handles store-and-forward batch uploads from local District Command Nodes
// and returns newly assigned district teams/users from the State Admin Portal.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-district-node-key',
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const nodeKey = req.headers.get('x-district-node-key');
    const body = await req.json();
    const { districtId, items = [], officerSnapshots = [] } = body;

    if (!districtId || !nodeKey) {
      return new Response(JSON.stringify({ error: 'districtId and x-district-node-key are required.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify District Node Key against stored SHA-256 hash
    const { data: district, error: distErr } = await supabase
      .from('districts')
      .select('id, node_key_hash')
      .eq('id', districtId)
      .single();

    if (distErr || !district) {
      return new Response(JSON.stringify({ error: 'District not registered in State Portal.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const providedHash = await sha256Hex(nodeKey);
    if (!district.node_key_hash || district.node_key_hash !== providedHash) {
      return new Response(JSON.stringify({ error: 'Invalid district node key.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = Date.now();
    const syncedQueueIds: string[] = [];

    // 1. Idempotently upsert queued offline records
    for (const item of items) {
      const { queueId, entityType, payload } = item;
      if (entityType === 'incident') {
        const timeline = typeof payload.timeline === 'string' ? JSON.parse(payload.timeline) : payload.timeline || [];
        await supabase.from('incidents').upsert({
          id: payload.id,
          district_id: districtId,
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          status: payload.status,
          location_lat: payload.locationLat ?? null,
          location_lng: payload.locationLng ?? null,
          reporter_id: payload.reporterId,
          assignee_id: payload.assigneeId ?? null,
          timestamp: payload.timestamp,
          timeline,
        }, { onConflict: 'id' });
      } else if (entityType === 'message') {
        await supabase.from('messages').upsert({
          id: payload.id,
          district_id: districtId,
          sender_id: payload.senderId,
          recipient_id: payload.recipientId ?? null,
          team_id: payload.teamId ?? null,
          body: payload.body,
          priority: payload.priority ?? 5,
          timestamp: payload.timestamp,
          is_broadcast: Boolean(payload.isBroadcast),
        }, { onConflict: 'id' });
      } else if (entityType === 'evidence') {
        await supabase.from('evidence').upsert({
          id: payload.id,
          district_id: districtId,
          officer_id: payload.officerId,
          incident_id: payload.incidentId ?? null,
          description: payload.description ?? '',
          file_path: payload.filePath ?? null,
          hash: payload.hash,
          hash_verified: Boolean(payload.hashVerified),
          location_lat: payload.locationLat ?? null,
          location_lng: payload.locationLng ?? null,
          timestamp: payload.timestamp,
        }, { onConflict: 'id' });
      } else if (entityType === 'audit') {
        await supabase.from('audit_logs').upsert({
          id: payload.id,
          district_id: districtId,
          user_id: payload.userId ?? null,
          action: payload.action,
          ip_address: payload.ipAddress ?? null,
          timestamp: payload.timestamp,
        }, { onConflict: 'id' });
      }

      if (queueId) syncedQueueIds.push(queueId);
    }

    // 2. Sync latest officer statuses & GPS snapshots
    for (const off of officerSnapshots) {
      await supabase.from('users').upsert({
        id: off.id,
        badge_number: off.badgeNumber,
        pin_hash: off.pinHash || 'synced_node',
        name: off.name,
        role: off.role || 'officer',
        status: off.status,
        battery: off.battery ?? 100,
        team_id: off.teamId ?? null,
        district_id: districtId,
        last_heartbeat: off.lastHeartbeat ?? now,
        last_lat: off.location?.latitude ?? null,
        last_lng: off.location?.longitude ?? null,
      }, { onConflict: 'id' });
    }

    // 3. Mark district as online & record sync timestamp
    await supabase
      .from('districts')
      .update({ status: 'online', last_sync_at: now })
      .eq('id', districtId);

    // 4. Pull assigned teams & users for this district so staging/reconnected nodes stay current
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name, description, color, district_id')
      .eq('district_id', districtId);

    const { data: users } = await supabase
      .from('users')
      .select('id, badge_number, pin_hash, name, role, team_id, district_id')
      .eq('district_id', districtId);

    return new Response(
      JSON.stringify({
        ok: true,
        serverTimestamp: now,
        syncedQueueIds,
        rosterUpdates: {
          teams: (teams || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            color: t.color,
            districtId: t.district_id,
          })),
          users: (users || []).map((u: any) => ({
            id: u.id,
            badgeNumber: u.badge_number,
            pinHash: u.pin_hash,
            name: u.name,
            role: u.role,
            teamId: u.team_id,
            districtId: u.district_id,
          })),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('district-sync error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

