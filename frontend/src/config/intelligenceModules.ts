export type IntelligenceModuleId =
  | 'dam_break'
  | 'flash_flood'
  | 'heatwave'
  | 'rainfall_ews'
  | 'urban_flood'
  | 'landslide';

export interface IntelligenceModuleConfig {
  id: IntelligenceModuleId;
  label: string;
  shortLabel: string;
  category: 'Hydrology' | 'Thermal' | 'Meteorology' | 'Geohazard';
  subtitle: string;
  accentColor: 'cyan' | 'amber' | 'red' | 'emerald';
}

export const INTELLIGENCE_MODULES: IntelligenceModuleConfig[] = [
  {
    id: 'dam_break',
    label: 'Dam Break & Inundation',
    shortLabel: 'Dam Break',
    category: 'Hydrology',
    subtitle: 'Reservoir breach scenarios, downstream inundation & evacuation zones',
    accentColor: 'cyan'
  },
  {
    id: 'flash_flood',
    label: 'Flash Flood Intelligence',
    shortLabel: 'Flash Flood',
    category: 'Hydrology',
    subtitle: 'Hilly & agency watersheds: rain, soil moisture, slope & history',
    accentColor: 'amber'
  },
  {
    id: 'heatwave',
    label: 'Heatwave & Thermal Stress',
    shortLabel: 'Heatwave',
    category: 'Thermal',
    subtitle: 'Human thermal stress index, heat-risk zones & safety advisories',
    accentColor: 'red'
  },
  {
    id: 'rainfall_ews',
    label: 'Rainfall & Inundation EWS',
    shortLabel: 'Rainfall EWS',
    category: 'Meteorology',
    subtitle: 'Live radar playback, IMD intensity thresholds & inundation risk',
    accentColor: 'cyan'
  },
  {
    id: 'urban_flood',
    label: 'Urban Flood Nowcasting',
    shortLabel: 'Urban Flood',
    category: 'Hydrology',
    subtitle: 'Street-level drainage analysis, flooded roads & safe emergency routes',
    accentColor: 'amber'
  },
  {
    id: 'landslide',
    label: 'Landslide Risk Monitor',
    shortLabel: 'Landslide',
    category: 'Geohazard',
    subtitle: 'Ghat & slope susceptibility, soil saturation & geo-tagged field reports',
    accentColor: 'red'
  }
];

/**
 * Helper for Role-Based Duty Access:
 * When credentials carry `allowedModules`, filter sidebar/dashboard cleanly.
 */
export function getEnabledIntelligenceModules(
  allowedIds?: IntelligenceModuleId[] | null
): IntelligenceModuleConfig[] {
  if (!allowedIds || allowedIds.length === 0) {
    return INTELLIGENCE_MODULES;
  }
  const allowedSet = new Set(allowedIds);
  return INTELLIGENCE_MODULES.filter(m => allowedSet.has(m.id));
}
