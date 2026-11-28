'use client';

import React from 'react';
import { IntelligenceModuleId } from '../../config/intelligenceModules';
import { DamBreakIntelligence } from './DamBreakIntelligence';
import { FlashFloodIntelligence } from './FlashFloodIntelligence';
import { HeatwaveIntelligence } from './HeatwaveIntelligence';
import { RainfallIntelligence } from './RainfallIntelligence';
import { UrbanFloodIntelligence } from './UrbanFloodIntelligence';
import { LandslideIntelligence } from './LandslideIntelligence';
import { FlyTo3DTarget } from '../shared/Hero3DGisView';
import { DistrictSummary, Incident, User } from '../../types';

interface IntelligenceModuleRendererProps {
  moduleId: IntelligenceModuleId;
  districts?: DistrictSummary[];
  officers?: User[];
  incidents?: Incident[];
  onInspectIn3D?: (target: FlyTo3DTarget) => void;
}

export const IntelligenceModuleRenderer: React.FC<IntelligenceModuleRendererProps> = ({
  moduleId,
  districts = [],
  officers = [],
  incidents = [],
  onInspectIn3D
}) => {
  switch (moduleId) {
    case 'dam_break':
      return <DamBreakIntelligence onInspectIn3D={onInspectIn3D} />;
    case 'flash_flood':
      return <FlashFloodIntelligence onInspectIn3D={onInspectIn3D} />;
    case 'heatwave':
      return <HeatwaveIntelligence districts={districts} officers={officers} onInspectIn3D={onInspectIn3D} />;
    case 'rainfall_ews':
      return <RainfallIntelligence incidents={incidents} onInspectIn3D={onInspectIn3D} />;
    case 'urban_flood':
      return <UrbanFloodIntelligence incidents={incidents} onInspectIn3D={onInspectIn3D} />;
    case 'landslide':
      return <LandslideIntelligence onInspectIn3D={onInspectIn3D} />;
    default:
      return null;
  }
};
