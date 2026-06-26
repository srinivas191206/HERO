import { User, Team } from '../../types';

export interface BackupRecommendation {
  incidentId: string;
  recommendedOfficers: Array<{
    officer: Omit<User, 'pinHash'>;
    distanceKm: number;
    estimatedResponseTimeMins: number;
    reason: string;
  }>;
  recommendedTeams: Array<{
    team: Team;
    reason: string;
  }>;
}

export interface RiskProfile {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number; // 0 to 100
  factors: string[];
}

export interface IRecommendationService {
  getBackupRecommendations(incidentId: string): Promise<BackupRecommendation>;
  getRiskProfile(lat: number, lng: number): Promise<RiskProfile>;
}
