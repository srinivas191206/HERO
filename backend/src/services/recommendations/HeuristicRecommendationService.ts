import { IRecommendationService, BackupRecommendation, RiskProfile } from './IRecommendationService';
import db from '../../config/db';
import { User, Team } from '../../types';

// Distance calculation using Haversine Formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export class HeuristicRecommendationService implements IRecommendationService {
  async getBackupRecommendations(incidentId: string): Promise<BackupRecommendation> {
    // 1. Fetch incident coordinates and priority
    const incident = db.prepare(`
      SELECT location_lat as lat, location_lng as lng, reporter_id as reporterId, priority
      FROM incidents WHERE id = ?
    `).get(incidentId) as { lat: number | null; lng: number | null; reporterId: string; priority: string } | undefined;

    if (!incident || incident.lat === null || incident.lng === null) {
      return { incidentId, recommendedOfficers: [], recommendedTeams: [] };
    }

    const { lat, lng, reporterId } = incident;

    // 2. Fetch all officers who are not Offline and not the reporter
    const officers = db.prepare(`
      SELECT id, name, status, battery, team_id as teamId, role
      FROM users
      WHERE role = 'officer' AND status NOT IN ('Offline', 'Lost Connection') AND id != ?
    `).all(reporterId) as User[];

    const officerDistances: Array<{ officer: User; distance: number }> = [];

    // 3. Find the latest GPS coordinate for each active officer
    for (const officer of officers) {
      const lastGps = db.prepare(`
        SELECT latitude, longitude 
        FROM gps_logs 
        WHERE officer_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
      `).get(officer.id) as { latitude: number; longitude: number } | undefined;

      if (lastGps) {
        const dist = calculateDistance(lat, lng, lastGps.latitude, lastGps.longitude);
        officerDistances.push({ officer, distance: dist });
      } else {
        // Assume default fallback distance if GPS is not yet logged
        officerDistances.push({ officer, distance: 5.0 }); // 5 km default
      }
    }

    // Sort officers by distance
    officerDistances.sort((a, b) => a.distance - b.distance);

    // Pick top 3 officers
    const recommendedOfficers = officerDistances.slice(0, 3).map(({ officer, distance }) => {
      // Estimate response time assuming average speed of 30 km/h (0.5 km/min)
      const estTime = Math.max(1, Math.round(distance / 0.5));
      let reason = 'Closest available responder.';
      if (officer.status === 'Patrolling') {
        reason = 'Currently patrolling nearby area.';
      } else if (officer.status === 'Available') {
        reason = 'Stationary and ready for deployment.';
      } else if (officer.status === 'Busy') {
        reason = 'Currently busy, but nearest backup resource.';
      }

      // Strip sensitive elements
      const safeOfficer = {
        id: officer.id,
        badgeNumber: officer.badgeNumber,
        name: officer.name,
        role: officer.role,
        status: officer.status,
        battery: officer.battery,
        teamId: officer.teamId,
        lastHeartbeat: officer.lastHeartbeat
      };

      return {
        officer: safeOfficer,
        distanceKm: Math.round(distance * 100) / 100,
        estimatedResponseTimeMins: estTime,
        reason
      };
    });

    // 4. Recommend teams based on member availability
    const recommendedTeams: Array<{ team: Team; reason: string }> = [];
    if (recommendedOfficers.length > 0) {
      const primaryTeamId = recommendedOfficers[0].officer.teamId;
      if (primaryTeamId) {
        const team = db.prepare('SELECT id, name, description, color FROM teams WHERE id = ?').get(primaryTeamId) as Team | undefined;
        if (team) {
          recommendedTeams.push({
            team,
            reason: `Primary recommended backup team because nearest responder (${recommendedOfficers[0].officer.name}) is a member.`
          });
        }
      }
    }

    // Fallback: If no teams recommended, suggest Alpha Team
    if (recommendedTeams.length === 0) {
      const team = db.prepare("SELECT id, name, description, color FROM teams WHERE id = 't1'").get() as Team | undefined;
      if (team) {
        recommendedTeams.push({
          team,
          reason: 'Alpha disaster response unit is recommended for critical support.'
        });
      }
    }

    return {
      incidentId,
      recommendedOfficers,
      recommendedTeams
    };
  }

  async getRiskProfile(lat: number, lng: number): Promise<RiskProfile> {
    try {
      // Look for active incidents within a 2km radius
      const incidents = db.prepare(`
        SELECT location_lat as lat, location_lng as lng, priority
        FROM incidents
        WHERE status != 'Closed' AND location_lat IS NOT NULL AND location_lng IS NOT NULL
      `).all() as Array<{ lat: number; lng: number; priority: string }>;

      let incidentScore = 0;
      let nearCount = 0;
      const factors: string[] = [];

      for (const inc of incidents) {
        const dist = calculateDistance(lat, lng, inc.lat, inc.lng);
        if (dist <= 2.0) {
          nearCount++;
          if (inc.priority === 'P1') {
            incidentScore += 40;
          } else if (inc.priority === 'P2') {
            incidentScore += 25;
          } else {
            incidentScore += 10;
          }
        }
      }

      const score = Math.min(100, Math.max(5, incidentScore));
      let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

      if (score >= 80) {
        level = 'CRITICAL';
        factors.push(`${nearCount} active critical reports in 2km radius.`);
        factors.push('Emergency SOS beacons active in close vicinity.');
      } else if (score >= 50) {
        level = 'HIGH';
        factors.push(`${nearCount} active incidents in 2km radius.`);
      } else if (score >= 20) {
        level = 'MEDIUM';
        factors.push('Scattered operations ongoing nearby.');
      } else {
        level = 'LOW';
        factors.push('No critical incidents within 2km.');
      }

      return {
        level,
        score,
        factors
      };
    } catch (error) {
      console.error('Failed to compute risk profile:', error);
      return { level: 'LOW', score: 0, factors: ['Failed to compute telemetry risk'] };
    }
  }
}
