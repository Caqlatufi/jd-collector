export type Coordinate = [number, number];
export interface Road {
  name: string;
  tier: number;
  coordinates: Coordinate[];
  bounds: [Coordinate, Coordinate];
}
export interface RoadLabel {name: string; x: number; y: number}
const tiers: Record<string, number> = {
  motorway: 0, motorway_link: 0, trunk: 0, trunk_link: 0, primary: 0, primary_link: 0,
  secondary: 1, secondary_link: 1, tertiary: 1, tertiary_link: 1,
  residential: 2, unclassified: 2, living_street: 2, service: 3,
};
export const roadTier = (zoom: number) => zoom >= 10 ? 3 : zoom >= 5 ? 2 : zoom >= 2 ? 1 : 0;
export const roadLevelLabel = (tier: number) => ['主干路', '主次干路', '街道路网', '街道与支路'][tier];

export const parseRoads = (raw: unknown): Road[] => {
  const collection = raw as {type?: string; features?: {properties: {name?: string; ref?: string; highway: string};
    geometry: {type: string; coordinates: Coordinate[]}}[]};
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('本地道路数据格式不正确');
  return collection.features.flatMap(feature => {
    const coordinates = feature.geometry?.coordinates;
    const tier = tiers[feature.properties?.highway];
    if (feature.geometry?.type !== 'LineString' || tier == null || !Array.isArray(coordinates) || coordinates.length < 2
      || coordinates.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return [];
    const xs = coordinates.map(point => point[0]);
    const ys = coordinates.map(point => point[1]);
    return [{name: feature.properties.name || feature.properties.ref || '', tier, coordinates,
      bounds: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] as [Coordinate, Coordinate]}];
  });
};

export const visibleRoads = (roads: Road[], tier: number, project: (point: Coordinate) => number[], width: number, height: number) =>
  roads.filter(road => {
    if (road.tier > tier) return false;
    const [left, bottom] = project(road.bounds[0]);
    const [right, top] = project(road.bounds[1]);
    return right >= 0 && left <= width && bottom >= 0 && top <= height;
  });

// Select road names in screen space, avoiding repeated names, overlaps and company markers.
export const roadLabels = (roads: Road[], project: (point: Coordinate) => number[], width: number, height: number,
  markers: number[][] = []): RoadLabel[] => {
  const candidates = roads.filter(road => road.name && !road.name.includes('匝道')).flatMap(road => {
    let longest = 0;
    let anchor: number[] | undefined;
    let previous = project(road.coordinates[0]);
    for (const coordinate of road.coordinates.slice(1)) {
      const next = project(coordinate);
      const length = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
      const x = (previous[0] + next[0]) / 2;
      const y = (previous[1] + next[1]) / 2;
      const halfWidth = road.name.length * 6 + 8;
      if (length > longest && x > halfWidth && x < width - halfWidth && y > 24 && y < height - 65) {
        longest = length;
        anchor = [x, y];
      }
      previous = next;
    }
    return anchor && longest >= 12 ? [{name: road.name, tier: road.tier, length: longest, x: anchor[0], y: anchor[1]}] : [];
  }).sort((a, b) => a.tier - b.tier || b.length - a.length);
  const labels: RoadLabel[] = [];
  for (const candidate of candidates) {
    if (labels.length >= 45) break;
    if (labels.some(label => label.name === candidate.name
      || (Math.abs(label.x - candidate.x) < (label.name.length + candidate.name.length) * 6 + 16 && Math.abs(label.y - candidate.y) < 28))) continue;
    if (markers.some(point => Math.abs(point[0] - candidate.x) < candidate.name.length * 6 + 20
      && Math.abs(point[1] - candidate.y) < 25)) continue;
    labels.push({name: candidate.name, x: candidate.x, y: candidate.y});
  }
  return labels;
};
