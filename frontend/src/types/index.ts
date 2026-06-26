export type OfficerStatus = 
  | 'Available' 
  | 'Patrolling' 
  | 'Assigned' 
  | 'Busy' 
  | 'Emergency' 
  | 'Lost Connection' 
  | 'Offline';

export interface User {
  id: string;
  badgeNumber: string;
  name: string;
  role: 'officer' | 'dispatcher';
  status: OfficerStatus;
  battery: number;
  teamId: string | null;
  teamName?: string;
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
  timestamp: number;
  timeline: string | Array<{ timestamp: number; event: string }>; // Can be parsed
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string | null;
  teamId: string | null;
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
  description: string;
  filePath: string; // Base64 simulated locally
  hash: string; // SHA-256 integrity validation
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
  action: string;
  ipAddress: string | null;
  timestamp: number;
}
