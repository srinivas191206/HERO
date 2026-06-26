import db from '../../config/db';
import { Device } from '../../types';

export class DeviceService {
  static registerOrSync(device: Omit<Device, 'lastSync'>): void {
    try {
      const now = Date.now();
      const check = db.prepare('SELECT device_id FROM devices WHERE device_id = ?').get(device.deviceId);
      
      if (check) {
        const update = db.prepare(`
          UPDATE devices 
          SET officer_id = ?, device_name = ?, battery_level = ?, network_type = ?, 
              firmware_version = ?, ip_address = ?, mac_address = ?, last_sync = ?, status = ?
          WHERE device_id = ?
        `);
        update.run(
          device.officerId,
          device.deviceName,
          device.batteryLevel,
          device.networkType,
          device.firmwareVersion,
          device.ipAddress,
          device.macAddress,
          now,
          device.status,
          device.deviceId
        );
      } else {
        const insert = db.prepare(`
          INSERT INTO devices (device_id, officer_id, device_name, battery_level, network_type, firmware_version, ip_address, mac_address, last_sync, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insert.run(
          device.deviceId,
          device.officerId,
          device.deviceName,
          device.batteryLevel,
          device.networkType,
          device.firmwareVersion,
          device.ipAddress,
          device.macAddress,
          now,
          device.status
        );
      }
    } catch (error) {
      console.error('Failed to sync device telemetry:', error);
    }
  }

  static getDevices(): Device[] {
    try {
      return db.prepare(`
        SELECT device_id as deviceId, officer_id as officerId, device_name as deviceName, 
               battery_level as batteryLevel, network_type as networkType, 
               firmware_version as firmwareVersion, ip_address as ipAddress, 
               mac_address as macAddress, last_sync as lastSync, status
        FROM devices
      `).all() as Device[];
    } catch (error) {
      console.error('Failed to retrieve devices:', error);
      return [];
    }
  }
}
