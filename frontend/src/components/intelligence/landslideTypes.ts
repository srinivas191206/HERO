import { Incident } from '../../types';
import { PointWeatherTelemetry } from '../../services/intelligence/OpenMeteoService';
import { TerrainSample } from '../../services/intelligence/TerrariumElevationService';

export type LandslideRegionFilter = 'ALL' | 'AP Eastern Ghats' | 'NER Corridor';
export type LandslideRiskTier = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
export type FieldReportSeverity = 'High' | 'Moderate' | 'Observation';
export type FieldObservationCategory =
  | 'Slope Crack'
  | 'Rockfall'
  | 'Mudslide / Slip'
  | 'Retaining Wall Distress'
  | 'Road Blockage';
export type FieldReportReviewStatus = 'Under Review' | 'Field Check' | 'Verified' | 'Resolved';

export interface LandslideZone {
  id: string;
  name: string;
  region: 'AP Eastern Ghats' | 'NER Corridor';
  stateOrDistrict: string;
  lat: number;
  lng: number;
  vulnerableRoad: string;
  historicalEvents: string;
  baseSlopeFallbackDeg: number;
}

export interface EvaluatedLandslideZone {
  zone: LandslideZone;
  weather?: PointWeatherTelemetry;
  terrain?: TerrainSample;
  slope: number;
  rain72: number;
  soilPct: number;
  risk: number;
  tier: LandslideRiskTier;
}

export interface FieldLandslideReport {
  id: string;
  zoneId: string;
  category?: FieldObservationCategory;
  note: string;
  severity: FieldReportSeverity;
  reviewStatus?: FieldReportReviewStatus;
  assignedUnit?: string;
  backendIncidentId?: string;
  lat: number;
  lng: number;
  reportedAt: number;
}

export interface CoordinatedLandslideItem {
  key: string;
  source: 'field' | 'incident';
  displayId: string;
  zoneId?: string;
  locationLabel: string;
  observation: string;
  severityLabel: string;
  statusLabel: string;
  timestamp: number;
  fieldReport?: FieldLandslideReport;
  incident?: Incident;
}
