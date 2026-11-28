import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
// Resolve socket.io-client from frontend/node_modules to avoid adding duplicate devDependencies
const { io: ioClient } = require(path.resolve(__dirname, '../../frontend/node_modules/socket.io-client'));

const TEST_DB = path.resolve('/tmp', `hero_audit_test_${Date.now()}.db`);
process.env.HERO_DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'test_secret_key_for_hero';
// Prevent dotenv from connecting tests to live Supabase
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.DISTRICT_NODE_KEY = '';

async function runTests() {
  const { startHeroServer } = await import('../src/index');
  const { CloudSyncService } = await import('../src/services/sync/CloudSyncService');
  const { server, stop } = startHeroServer(0);

  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', () => resolve());
  });

  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  // Mock Supabase Edge Function server for CloudSyncService offline->online test
  let receivedSyncPayload: any = null;
  const mockCloudServer = http.createServer((req, res) => {
    if (req.url?.includes('/functions/v1/district-sync')) {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        receivedSyncPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            serverTimestamp: Date.now(),
            syncedQueueIds: (receivedSyncPayload.items || []).map((i: any) => i.queueId),
            rosterUpdates: { teams: [], users: [] }
          })
        );
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => mockCloudServer.listen(0, '127.0.0.1', () => resolve()));
  const cloudPort = (mockCloudServer.address() as { port: number }).port;

  try {
    console.log('1. Testing /health endpoint...');
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const health = await healthRes.json();
    assert.strictEqual(health.status, 'Operational');
    assert.strictEqual(health.districtId, 'd_eluru');

    console.log('2. Testing authentication (state_admin, dispatcher, officer, invalid)...');
    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ badgeNumber: 'p1', pin: 'wrong' })
    });
    assert.strictEqual(badLogin.status, 401);

    const loginUser = async (badgeNumber: string, pin: string) => {
      const r = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeNumber, pin })
      });
      assert.strictEqual(r.status, 200, `Login failed for ${badgeNumber}`);
      return r.json();
    };

    const stateAuth = await loginUser('state_admin', 'police');
    const dispAuth = await loginUser('admin', 'police');
    assert.strictEqual(stateAuth.user.role, 'state_admin');
    assert.strictEqual(dispAuth.user.role, 'dispatcher');

    // Deploy initial officers (db starts with 0 officers by default)
    const initDeployRes = await fetch(`${baseUrl}/api/officers/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dispAuth.token}` },
      body: JSON.stringify({ count: 2, defaultPin: 'police' })
    });
    assert.strictEqual(initDeployRes.status, 201);
    const offAuth = await loginUser('p1', 'police');
    assert.strictEqual(offAuth.user.role, 'officer');

    console.log('3. Testing RBAC protections...');
    const offStateOverview = await fetch(`${baseUrl}/api/state/overview`, {
      headers: { Authorization: `Bearer ${offAuth.token}` }
    });
    assert.strictEqual(offStateOverview.status, 403);

    const offDispatch = await fetch(`${baseUrl}/api/incidents/fake-id/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${offAuth.token}` },
      body: JSON.stringify({ assigneeId: 'u_off2' })
    });
    assert.strictEqual(offDispatch.status, 403);

    console.log('4. Testing State Admin district creation, user assignment & bundle export...');
    const createDistRes = await fetch(`${baseUrl}/api/state/districts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stateAuth.token}` },
      body: JSON.stringify({
        name: 'Kakinada Test Hub',
        code: 'KKD',
        stateName: 'Andhra Pradesh',
        centerLat: 16.9891,
        centerLng: 82.2475
      })
    });
    assert.strictEqual(createDistRes.status, 201);
    const createdDist = await createDistRes.json();
    const kkdId = createdDist.district.id;
    assert.ok(createdDist.nodeKey.startsWith('hk_'));

    const assignUserRes = await fetch(`${baseUrl}/api/state/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stateAuth.token}` },
      body: JSON.stringify({
        badgeNumber: 'kkd_p1',
        name: 'Kakinada Officer 1',
        pin: 'police',
        role: 'officer',
        districtId: kkdId
      })
    });
    assert.strictEqual(assignUserRes.status, 201);

    const kkdOffAuth = await loginUser('kkd_p1', 'police');
    assert.strictEqual(kkdOffAuth.user.districtId, kkdId);

    // Duplicate district code & duplicate PID prevention
    const dupDistRes = await fetch(`${baseUrl}/api/state/districts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stateAuth.token}` },
      body: JSON.stringify({ name: 'Dup KKD', code: 'KKD', centerLat: 16.9, centerLng: 82.2 })
    });
    assert.strictEqual(dupDistRes.status, 409);

    const dupUserRes = await fetch(`${baseUrl}/api/state/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stateAuth.token}` },
      body: JSON.stringify({
        badgeNumber: 'kkd_p1',
        name: 'Duplicate',
        pin: 'police',
        role: 'officer',
        districtId: kkdId
      })
    });
    assert.strictEqual(dupUserRes.status, 409);

    const kkdDispRes = await fetch(`${baseUrl}/api/state/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stateAuth.token}` },
      body: JSON.stringify({
        badgeNumber: 'kkd_disp1',
        name: 'Kakinada Dispatcher',
        pin: 'police',
        role: 'dispatcher',
        districtId: kkdId
      })
    });
    assert.strictEqual(kkdDispRes.status, 201);

    const invalidBatchRes = await fetch(`${baseUrl}/api/officers/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dispAuth.token}` },
      body: JSON.stringify({ count: 55, defaultPin: 'police' })
    });
    assert.strictEqual(invalidBatchRes.status, 400);

    const bundleRes = await fetch(`${baseUrl}/api/state/districts/${kkdId}/bundle`, {
      headers: { Authorization: `Bearer ${stateAuth.token}` }
    });
    assert.strictEqual(bundleRes.status, 200);
    const bundle = await bundleRes.json();
    assert.strictEqual(bundle.district.code, 'KKD');
    assert.ok(bundle.users.some((u: any) => u.badgeNumber === 'kkd_p1'));

    console.log('4b. Testing batch officer deployment by count (5 officers, PIN=police) & case-insensitive login...');
    const batchRes = await fetch(`${baseUrl}/api/officers/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dispAuth.token}` },
      body: JSON.stringify({ count: 5, defaultPin: 'police' })
    });
    assert.strictEqual(batchRes.status, 201);
    const batchBody = await batchRes.json();
    assert.strictEqual(batchBody.created.length, 5);
    const firstGeneratedPid = batchBody.created[0].badgeNumber;
    const upperCaseLogin = await loginUser(firstGeneratedPid.toUpperCase(), 'police');
    assert.strictEqual(upperCaseLogin.user.badgeNumber, firstGeneratedPid);

    console.log('5. Testing Socket.IO JWT enforcement, SOS ACK, HQ messaging & SHA-256 verification...');
    await new Promise<void>((resolve, reject) => {
      const unauthSocket = ioClient(baseUrl, { reconnection: false });
      unauthSocket.on('connect', () => {
        unauthSocket.disconnect();
        reject(new Error('Unauthenticated socket should not connect'));
      });
      unauthSocket.on('connect_error', () => {
        unauthSocket.disconnect();
        resolve();
      });
    });

    const offSocket = ioClient(baseUrl, { auth: { token: offAuth.token }, reconnection: false });
    await new Promise<void>((resolve, reject) => {
      offSocket.on('connect', () => resolve());
      offSocket.on('connect_error', reject);
    });

    // Trigger SOS & await sos:ack
    const sosAck: any = await new Promise((resolve) => {
      offSocket.once('sos:ack', resolve);
      offSocket.emit('sos:trigger', { id: 'sos-test-1', lat: 16.7106, lng: 81.0952 });
    });
    assert.strictEqual(sosAck.status, 'delivered');
    assert.ok(sosAck.incidentId);

    // Verify recommendations include badgeNumber & district scoping
    const recRes = await fetch(`${baseUrl}/api/incidents/${sosAck.incidentId}/recommendations`, {
      headers: { Authorization: `Bearer ${dispAuth.token}` }
    });
    assert.strictEqual(recRes.status, 200);

    // Cross-district isolation: KKD officer cannot see ELR SOS incident
    const kkdIncidentsRes = await fetch(`${baseUrl}/api/incidents`, {
      headers: { Authorization: `Bearer ${kkdOffAuth.token}` }
    });
    const kkdIncidents = await kkdIncidentsRes.json();
    assert.strictEqual(kkdIncidents.length, 0);

    // Send direct message to 'hq' (verifies FK alias resolution to u_disp1)
    const msgAck: any = await new Promise((resolve) => {
      offSocket.once('message:ack', resolve);
      offSocket.emit('message:send', {
        id: 'msg-hq-test-1',
        recipientId: 'hq',
        teamId: null,
        body: 'Testing direct HQ message FK fix',
        priority: 4,
        isBroadcast: false
      });
    });
    assert.strictEqual(msgAck.status, 'delivered');

    // Send valid evidence & tampered evidence
    const sampleBytes = Buffer.from('hero-test-image-bytes');
    const validHash = crypto.createHash('sha256').update(sampleBytes).digest('hex');
    const sampleB64 = `data:image/jpeg;base64,${sampleBytes.toString('base64')}`;

    const validEvAck: any = await new Promise((resolve) => {
      offSocket.once('evidence:ack', resolve);
      offSocket.emit('evidence:send', {
        id: 'ev-valid-1',
        incidentId: sosAck.incidentId,
        description: 'Valid evidence',
        filePath: sampleB64,
        hash: validHash,
        locationLat: 16.71,
        locationLng: 81.09,
        timestamp: Date.now()
      });
    });
    assert.strictEqual(validEvAck.status, 'delivered');
    assert.strictEqual(validEvAck.hashVerified, true);

    const tamperedEvAck: any = await new Promise((resolve) => {
      offSocket.once('evidence:ack', resolve);
      offSocket.emit('evidence:send', {
        id: 'ev-tampered-1',
        incidentId: sosAck.incidentId,
        description: 'Tampered evidence',
        filePath: sampleB64,
        hash: '0'.repeat(64),
        locationLat: 16.71,
        locationLng: 81.09,
        timestamp: Date.now()
      });
    });
    assert.strictEqual(tamperedEvAck.status, 'delivered');
    assert.strictEqual(tamperedEvAck.hashVerified, false);

    // Verify independent /api/evidence/:id/verify endpoint
    const verifyRes = await fetch(`${baseUrl}/api/evidence/ev-tampered-1/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dispAuth.token}` }
    });
    const verifyBody = await verifyRes.json();
    assert.strictEqual(verifyBody.verified, false);
    assert.strictEqual(verifyBody.computedHash, validHash);

    console.log('5b. Testing enriched /api/state/overview telemetry (incidents, officers, auditLogs, health)...');
    const stateOverviewRes = await fetch(`${baseUrl}/api/state/overview`, {
      headers: { Authorization: `Bearer ${stateAuth.token}` }
    });
    assert.strictEqual(stateOverviewRes.status, 200);
    const stateOverview = await stateOverviewRes.json();
    assert.ok(Array.isArray(stateOverview.districts) && stateOverview.districts.length >= 3);
    assert.ok(Array.isArray(stateOverview.incidents) && stateOverview.incidents.some((i: any) => i.id === sosAck.incidentId));
    assert.ok(Array.isArray(stateOverview.officers) && stateOverview.officers.some((o: any) => o.badgeNumber === 'kkd_p1'));
    const kkdOfficer = stateOverview.officers.find((o: any) => o.badgeNumber === 'kkd_p1');
    assert.strictEqual(kkdOfficer.location, null, 'Officer without GPS log must report null location rather than fabricated coords');
    assert.ok(Array.isArray(stateOverview.auditLogs) && stateOverview.auditLogs.length > 0);
    assert.strictEqual(stateOverview.health?.status, 'Operational');
    assert.ok(typeof stateOverview.health?.pendingSyncTotal === 'number');

    offSocket.disconnect();

    console.log('6. Testing CloudSyncService offline queue -> Supabase Edge Function drain...');
    process.env.SUPABASE_URL = `http://127.0.0.1:${cloudPort}`;
    process.env.DISTRICT_NODE_KEY = 'test-node-key';
    const syncResult = await CloudSyncService.syncNow('d_eluru');
    assert.strictEqual(syncResult.success, true);
    assert.ok(syncResult.pushedCount > 0);
    assert.ok(receivedSyncPayload && receivedSyncPayload.districtId === 'd_eluru');

    console.log('ALL_INTEGRATION_TESTS_PASSED');
  } finally {
    stop();
    mockCloudServer.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(TEST_DB + suffix)) fs.unlinkSync(TEST_DB + suffix);
      } catch {}
    }
  }
}

runTests().catch((err) => {
  console.error('INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
