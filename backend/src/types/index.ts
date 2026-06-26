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
  lastHeartbeat: number;
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
  timeline: string; // JSON string of transitions
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
}

export interface Evidence {
  id: string;
  officerId: string;
  incidentId: string | null;
  description: string;
  filePath: string;
  hash: string; // SHA-256 integrity checksum
  locationLat: number | null;
  locationLng: number | null;
  timestamp: number;
}

export interface GPSLog {
  id: string;
  officerId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  battery: number;
  accuracy: number | null;
  networkQuality: string | null;
  timestamp: number;
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
