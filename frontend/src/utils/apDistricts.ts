export interface ApDistrictMeta {
  district: string;
  code: string;
  centerLat: number;
  centerLng: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  peakTmax: number | null;
  peakMandal: string;
}

export interface TacticalFacility3D {
  id: string;
  name: string;
  kind: 'station' | 'shelter' | 'landmark';
  lat: number;
  lng: number;
  levels: number;
  desc: string;
  query?: string;
}

export const AP_DISTRICTS: ApDistrictMeta[] = [
  { district: 'Alluri Sitharama Raju', code: 'ASR', centerLat: 18.04666, centerLng: 82.56352, minLat: 17.54419, maxLat: 18.54913, minLng: 81.86086, maxLng: 83.26619, peakTmax: 37.6, peakMandal: 'Aruku Valley' },
  { district: 'Anakapalli', code: 'AKP', centerLat: 17.69984, centerLng: 82.74683, minLat: 17.24834, maxLat: 18.15133, minLng: 82.32907, maxLng: 83.16459, peakTmax: 41.3, peakMandal: 'Devarapalle' },
  { district: 'Ananthapuramu', code: 'ATP', centerLat: 14.72476, centerLng: 77.4492, minLat: 14.21421, maxLat: 15.2353, minLng: 76.7606, maxLng: 78.13779, peakTmax: 42.2, peakMandal: 'Kalyandurg' },
  { district: 'Annamayya', code: 'ANM', centerLat: 13.78846, centerLng: 78.55818, minLat: 13.26676, maxLat: 14.31017, minLng: 78.06645, maxLng: 79.04991, peakTmax: 39.8, peakMandal: 'Sambepalle' },
  { district: 'Bapatla', code: 'BPT', centerLat: 15.93374, centerLng: 80.45346, minLat: 15.61089, maxLat: 16.25659, minLng: 80.0042, maxLng: 80.90273, peakTmax: 44.0, peakMandal: 'Karamchedu' },
  { district: 'Chittoor', code: 'CTR', centerLat: 13.20318, centerLng: 78.99699, minLat: 12.62373, maxLat: 13.78263, minLng: 78.19947, maxLng: 79.79451, peakTmax: 42.4, peakMandal: 'Thavanampalle' },
  { district: 'Dr.B.R.Ambedkar Konaseema', code: 'KNS', centerLat: 16.62438, centerLng: 82.02567, minLat: 16.30128, maxLat: 16.94748, minLng: 81.69653, maxLng: 82.35481, peakTmax: 39.2, peakMandal: 'Ramachandrapuram' },
  { district: 'East Godavari', code: 'EGD', centerLat: 16.99606, centerLng: 81.6923, minLat: 16.67418, maxLat: 17.31794, minLng: 81.2913, maxLng: 82.0933, peakTmax: 42.2, peakMandal: 'Gopalapuram' },
  { district: 'Eluru', code: 'ELR', centerLat: 17.01461, centerLng: 81.18263, minLat: 16.37652, maxLat: 17.65271, minLng: 80.68589, maxLng: 81.67937, peakTmax: 44.5, peakMandal: 'Chintalapudi' },
  { district: 'Guntur', code: 'GNT', centerLat: 16.28594, centerLng: 80.46263, minLat: 15.98086, maxLat: 16.59101, minLng: 80.12133, maxLng: 80.80393, peakTmax: 44.1, peakMandal: 'Vatticherukuru' },
  { district: 'Kakinada', code: 'KKD', centerLat: 17.10364, centerLng: 82.25395, minLat: 16.67242, maxLat: 17.53486, minLng: 81.90312, maxLng: 82.60477, peakTmax: 40.1, peakMandal: 'Peddapuram' },
  { district: 'Krishna', code: 'KRS', centerLat: 16.23601, centerLng: 81.10659, minLat: 15.70973, maxLat: 16.76229, minLng: 80.65259, maxLng: 81.56059, peakTmax: 45.1, peakMandal: 'Pedaparupudi' },
  { district: 'Kurnool', code: 'KNL', centerLat: 15.54841, centerLng: 77.62833, minLat: 15.13154, maxLat: 15.96529, minLng: 76.98828, maxLng: 78.26838, peakTmax: 41.7, peakMandal: 'Mantralayam' },
  { district: 'Markapuram', code: 'MRK', centerLat: 15.66464, centerLng: 79.2664, minLat: 15.02224, maxLat: 16.30703, minLng: 78.73634, maxLng: 79.79647, peakTmax: 44.5, peakMandal: 'Pamur' },
  { district: 'NTR', code: 'NTR', centerLat: 16.81661, centerLng: 80.42786, minLat: 16.47999, maxLat: 17.15324, minLng: 80.00223, maxLng: 80.8535, peakTmax: 45.1, peakMandal: 'Nandigama' },
  { district: 'Nandyal', code: 'NDL', centerLat: 15.5257, centerLng: 78.28881, minLat: 14.90219, maxLat: 16.14922, minLng: 77.64848, maxLng: 78.92914, peakTmax: 43.2, peakMandal: 'Sanjamala' },
  { district: 'Palnadu', code: 'PLD', centerLat: 16.32372, centerLng: 79.81849, minLat: 15.82335, maxLat: 16.82409, minLng: 79.20769, maxLng: 80.4293, peakTmax: 45.9, peakMandal: 'Piduguralla' },
  { district: 'Parvathipuram Manyam', code: 'PVP', centerLat: 18.75104, centerLng: 83.45696, minLat: 18.3402, maxLat: 19.16189, minLng: 82.99892, maxLng: 83.91501, peakTmax: 36.7, peakMandal: 'Seethanagaram' },
  { district: 'Polavaram', code: 'PLV', centerLat: 17.61782, centerLng: 81.60943, minLat: 17.22194, maxLat: 18.0137, minLng: 80.87581, maxLng: 82.34306, peakTmax: 42.6, peakMandal: 'Vararamachandrapuram' },
  { district: 'Prakasam', code: 'PKM', centerLat: 15.5649, centerLng: 79.79308, minLat: 14.96582, maxLat: 16.16398, minLng: 79.31276, maxLng: 80.27339, peakTmax: 44.6, peakMandal: 'Addanki' },
  { district: 'Sri Potti Sriramulu Nellore', code: 'NLR', centerLat: 14.55775, centerLng: 79.6393, minLat: 13.99763, maxLat: 15.11787, minLng: 79.08099, maxLng: 80.19761, peakTmax: 45.5, peakMandal: 'Gudur' },
  { district: 'Sri Sathya Sai', code: 'SSS', centerLat: 14.16839, centerLng: 77.67812, minLat: 13.6824, maxLat: 14.65438, minLng: 76.88616, maxLng: 78.47007, peakTmax: 40.4, peakMandal: 'Tadimarri' },
  { district: 'Srikakulam', code: 'SKL', centerLat: 18.62214, centerLng: 84.17484, minLat: 18.07861, maxLat: 19.16566, minLng: 83.58502, maxLng: 84.76465, peakTmax: 35.9, peakMandal: 'Lakshminarsupeta' },
  { district: 'Tirupati', code: 'TPT', centerLat: 13.88978, centerLng: 79.60929, minLat: 13.29358, maxLat: 14.48599, minLng: 78.95125, maxLng: 80.26733, peakTmax: 44.4, peakMandal: 'Venkatagiri' },
  { district: 'Visakhapatnam', code: 'VZG', centerLat: 17.80638, centerLng: 83.3197, minLat: 17.54697, maxLat: 18.06579, minLng: 83.1121, maxLng: 83.5273, peakTmax: 42.4, peakMandal: 'Mulagada' },
  { district: 'Vizianagaram', code: 'VZM', centerLat: 18.27514, centerLng: 83.42092, minLat: 17.83848, maxLat: 18.7118, minLng: 83.00754, maxLng: 83.83429, peakTmax: 38.0, peakMandal: 'Vepada' },
  { district: 'West Godavari', code: 'WGD', centerLat: 16.64368, centerLng: 81.5926, minLat: 16.31498, maxLat: 16.97237, minLng: 81.32641, maxLng: 81.8588, peakTmax: 41.5, peakMandal: 'Poduru' },
  { district: 'Y.S.R.Kadapa', code: 'KDP', centerLat: 14.53919, centerLng: 78.62908, minLat: 13.84884, maxLat: 15.22954, minLng: 77.94408, maxLng: 79.31408, peakTmax: 43.2, peakMandal: 'B.Kodur' },
];

const CODE_ALIAS: Record<string, string> = {
  elr: 'Eluru',
  kkd: 'Kakinada',
  vzg: 'Visakhapatnam',
  vsp: 'Visakhapatnam',
  vizag: 'Visakhapatnam',
  knl: 'Kurnool',
  gnt: 'Guntur',
  tpt: 'Tirupati',
  vja: 'NTR',
  vijayawada: 'NTR',
  nlr: 'Sri Potti Sriramulu Nellore',
  nellore: 'Sri Potti Sriramulu Nellore',
  kdp: 'Y.S.R.Kadapa',
  kadapa: 'Y.S.R.Kadapa',
  atp: 'Ananthapuramu',
  skl: 'Srikakulam',
  vzm: 'Vizianagaram',
  egd: 'East Godavari',
  rjy: 'East Godavari',
  rajahmundry: 'East Godavari',
  rajamahendravaram: 'East Godavari',
  wgd: 'West Godavari',
  pkm: 'Prakasam',
  ctr: 'Chittoor',
  ndl: 'Nandyal',
  bpt: 'Bapatla',
  pld: 'Palnadu',
  akp: 'Anakapalli',
  asr: 'Alluri Sitharama Raju',
  plv: 'Polavaram',
  mrk: 'Markapuram',
};

function norm(v: string): string {
  return v
    .toLowerCase()
    .replace(/\bdistrict\b|\bhub\b|\bcommand\b|\bpolice\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

export function matchApDistrict(nameOrCode?: string | null): ApDistrictMeta | null {
  if (!nameOrCode) return null;
  const trimmed = nameOrCode.trim();
  const alias = CODE_ALIAS[trimmed.toLowerCase()];
  if (alias) {
    return AP_DISTRICTS.find(d => d.district === alias) || null;
  }
  const n = norm(trimmed);
  if (!n) return null;
  return (
    AP_DISTRICTS.find(d => norm(d.district) === n || d.code.toLowerCase() === trimmed.toLowerCase()) ||
    AP_DISTRICTS.find(d => norm(d.district).includes(n) || n.includes(norm(d.district))) ||
    null
  );
}

export function getTacticalFacilitiesForDistrict(
  districtName?: string | null,
  centerLat = 16.7107,
  centerLng = 81.0952
): TacticalFacility3D[] {
  const matched = matchApDistrict(districtName);
  const name = matched?.district || districtName || 'Eluru';
  const lat = centerLat || matched?.centerLat || 16.7107;
  const lng = centerLng || matched?.centerLng || 81.0952;

  if (name === 'Kakinada') {
    return [
      { id: 'kkd-hq', name: 'Kakinada District Collectorate EOC', kind: 'station', lat: 16.9891, lng: 82.2475, levels: 4, desc: 'Primary District Police & Disaster EOC', query: 'Collectorate' },
      { id: 'kkd-thub', name: 'Technical Hub (T-Hub) Surampalem', kind: 'landmark', lat: 17.08725, lng: 82.0688, levels: 5, desc: 'Aditya University Command Innovation Building', query: 'Technical Hub' },
      { id: 'kkd-cotton', name: 'Cotton Bhavan (Admin HQ)', kind: 'landmark', lat: 17.08799, lng: 82.06686, levels: 5, desc: 'Aditya University Central Admin Block', query: 'Cotton Bhavan' },
      { id: 'kkd-shelter', name: 'JNTUK Disaster Relief Shelter', kind: 'shelter', lat: 16.9785, lng: 82.2415, levels: 3, desc: 'Emergency Cyclone Evacuation & Medical Base', query: 'JNTU' },
    ];
  }

  return [
    { id: `${name}-dpo`, name: `${name} District Police Office (DPO)`, kind: 'station', lat, lng, levels: 4, desc: `Superintendent of Police & ${name} Command Center` },
    { id: `${name}-ps1`, name: `${name} I-Town Police Station`, kind: 'station', lat: lat + 0.0042, lng: lng - 0.0038, levels: 3, desc: 'Urban Quick Response Tactical Police Station' },
    { id: `${name}-sh1`, name: `${name} Central Disaster Shelter`, kind: 'shelter', lat: lat - 0.0035, lng: lng + 0.0048, levels: 3, desc: 'APSDMA Heatwave & Cyclone Relief Shelter Facility' },
    { id: `${name}-eoc`, name: `${name} Collectorate & EOC Building`, kind: 'landmark', lat: lat + 0.0021, lng: lng + 0.0031, levels: 5, desc: 'District Collectorate Multi-Storey Command Complex' },
  ];
}
