export type OfficerStatus = 
  | 'Available' 
  | 'Patrolling' 
  | 'Assigned' 
  | 'Busy' 
  | 'Emergency' 
  | 'Lost Connection' 
  | 'Offline';

export type UserRole = 'officer' | 'dispatcher' | 'state_admin';

export interface District {
  id: string;
  code: string;
  name: string;
  stateName: string;
  centerLat: number;
  centerLng: number;
  status: 'online' | 'offline' | 'provisioning';
  lastSyncAt: number | null;
  createdAt: number;
}

export interface DistrictSummary extends District {
  totalOfficers: number;
  onlineOfficers: number;
  sosCount: number;
  activeIncidents: number;
  p1Count: number;
  pendingSyncCount: number;
}

export interface User {
  id: string;
  badgeNumber: string;
  name: string;
  role: UserRole;
  status: OfficerStatus;
  battery: number;
  teamId: string | null;
  teamName?: string;
  districtId?: string;
  districtName?: string;
  districtCode?: string;
  lastHeartbeat?: number;
  location?: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    speed?: number | null;
    accuracy?: number | null;
    networkQuality?: string | null;
    timestamp: number;
  } | null;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  color: string;
  districtId?: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'Open' | 'Dispatched' | 'Resolved' | 'Closed';
  locationLat: number | null;
  locationLng: number | null;
  reporterId: string;
  assigneeId: string | null;
  districtId?: string;
  timestamp: number;
  timeline: string | Array<{ timestamp: number; event: string }>; // Can be parsed
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string | null;
  teamId: string | null;
  districtId?: string;
  body: string;
  priority: number;
  timestamp: number;
  isBroadcast: boolean;
  syncStatus?: 'queued' | 'delivered' | 'failed';
}

export interface Evidence {
  id: string;
  officerId: string;
  incidentId: string | null;
  districtId?: string;
  description: string;
  filePath: string; // Base64 simulated locally
  hash: string; // SHA-256 integrity validation
  hashVerified?: boolean;
  locationLat: number | null;
  locationLng: number | null;
  timestamp: number;
  syncStatus?: 'queued' | 'delivered' | 'failed';
}

export interface Device {
  deviceId: string;
  officerId: string | null;
  deviceName: string;
  batteryLevel: number;
  networkType: string;
  firmwareVersion: string;
  ipAddress: string;
  macAddress: string;
  lastSync: number;
  status: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  districtId?: string | null;
  action: string;
  ipAddress: string | null;
  timestamp: number;
}

export interface StateInfrastructureHealth {
  status: 'Operational' | 'Degraded' | 'Offline';
  activeDistrictId?: string;
  cloudConfigured: boolean;
  latencyMs?: number;
  pendingSyncTotal: number;
  failedSyncTotal: number;
  syncedTotal: number;
  lanIPs?: string[];
  timestamp: number;
}

export interface StateOperationsSnapshot {
  districts: DistrictSummary[];
  incidents: Incident[];
  officers: User[];
  auditLogs: AuditLog[];
  health: StateInfrastructureHealth;
}
