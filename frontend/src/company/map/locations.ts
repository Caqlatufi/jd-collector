import shanghai from '@/company/assets/shanghai.json';
import type {Company, CompanyWorkLocation} from '@/common/model/domain';
import type {AddressDiscovery} from '@/company/api/companyAddressApi';

export interface PostingLocation {postingId: number; companyId: number; address: string}
export interface LocationPosition {address: string; longitude?: number | null; latitude?: number | null; matchedName?: string}
export type Precision = 'MANUAL' | 'PLACE' | 'DISTRICT' | 'PENDING' | 'OUTSIDE';
export interface MapLocation {
  key: string;
  company: Company;
  address: string;
  label: string;
  sources: string[];
  postingIds: number[];
  longitude?: number;
  latitude?: number;
  district?: string;
  precision: Precision;
  matchedName?: string;
  evidence?: AddressDiscovery[];
}

export const districts = shanghai.features.map(feature => feature.properties.name);
export const normalizeAddress = (value: string) => value.replace(/上海市/g, '上海').replace(/[\s·（）()]/g, '');
const cityOnly = (address: string) => /^(上海市?|待确认|待核实|尚未填写工作地址)?$/.test(address.replace(/[（(].*?[）)]|[\s·-]/g, ''));
const foreignCity = /^(?:中国)?(?:北京|天津|重庆|杭州|深圳|广州|苏州|南京|武汉|成都|合肥|厦门|宁波|无锡|西安|济南|青岛|郑州|长沙|福州|东莞|珠海|南昌|昆明|沈阳|大连|贵阳|佛山|南宁|海口)/;

const inRing = (point: number[], ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1])
      && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const districtAt = (longitude: number, latitude: number) => shanghai.features.find(feature => {
  const polygons = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates as number[][][][] : [feature.geometry.coordinates as unknown as number[][][]];
  return polygons.some(polygon => inRing([longitude, latitude], polygon[0])
    && !polygon.slice(1).some(ring => inRing([longitude, latitude], ring)));
})?.properties.name;

export const isAreaOnly = (address: string) => {
  const clean = normalizeAddress(address.replace(/[（(].*?[）)]/g, ''));
  return cityOnly(address) || districts.some(district => clean === district || clean === `上海${district}`);
};

export function collectLocations(companies: Company[], postings: PostingLocation[], positions: LocationPosition[], discoveries: AddressDiscovery[] = []): MapLocation[] {
  const cached = new Map(positions.map(position => [normalizeAddress(position.address), position]));
  const result: MapLocation[] = [];
  for (const company of companies) {
    const entries = new Map<string, MapLocation>();
    const append = (location: CompanyWorkLocation, source: string, postingId?: number) => {
      const parts = location.address.split(/[；;\n]/).flatMap(part =>
        /^(?:上海市?|杭州市?|北京市?|深圳市?)(?:、(?:上海市?|杭州市?|北京市?|深圳市?))+$/.test(part.trim())
          ? part.split('、') : [part]);
      for (const raw of parts) {
        const address = raw.trim();
        if (!address || /^JD\s*Location:/i.test(address)) continue;
        const normalized = normalizeAddress(address);
        let entry = entries.get(normalized);
        if (!entry) {
          const position = cached.get(normalized);
          const manual = location.longitude != null && location.latitude != null;
          const longitude = manual ? location.longitude! : position?.longitude;
          const latitude = manual ? location.latitude! : position?.latitude;
          const outside = foreignCity.test(address);
          const coordinateDistrict = longitude != null && latitude != null ? districtAt(longitude, latitude) : undefined;
          const district = districts.find(name => address.includes(name) || address.includes(name.replace(/区$/, '')));
          const feature = shanghai.features.find(item => item.properties.name === district);
          const hasCoordinates = longitude != null && latitude != null;
          const precision: Precision = outside || (hasCoordinates && !coordinateDistrict) ? 'OUTSIDE'
            : hasCoordinates ? manual ? 'MANUAL' : 'PLACE' : district ? 'DISTRICT' : 'PENDING';
          entry = {
            key: `${company.id}:${normalized}`, company, address, label: location.label || '',
            sources: [], postingIds: [], precision, district: coordinateDistrict || district,
            longitude: hasCoordinates ? longitude! : feature?.properties.centroid?.[0],
            latitude: hasCoordinates ? latitude! : feature?.properties.centroid?.[1],
            matchedName: position?.matchedName,
          };
          entries.set(normalized, entry);
        }
        if (!entry.sources.includes(source)) entry.sources.push(source);
        if (postingId != null && !entry.postingIds.includes(postingId)) entry.postingIds.push(postingId);
      }
    };
    for (const location of company.workLocations ?? []) append(location, '工作地点');
    if (company.address) append({address: company.address}, '公司资料');
    for (const posting of postings.filter(posting => posting.companyId === company.id)) {
      if (posting.address) append({address: posting.address}, 'JD', posting.postingId);
    }
    for (const discovery of discoveries.filter(row => row.companyId === company.id)) {
      append({address: discovery.address}, discovery.sourceType === 'JD' ? 'JD地址证据' : '公司地址参考', discovery.postingId);
      const entry = entries.get(normalizeAddress(discovery.address));
      if (entry) { entry.evidence ??= []; entry.evidence.push(discovery); }
    }
    if (!entries.size) append({address: '尚未填写工作地址'}, '公司资料');
    const all = [...entries.values()];
    result.push(...all.filter(entry => {
      if (cityOnly(entry.address) && all.some(other => other !== entry && other.precision !== 'OUTSIDE' && !cityOnly(other.address))) return false;
      if (isAreaOnly(entry.address) && entry.district && all.some(other => other !== entry
        && other.district === entry.district && !isAreaOnly(other.address))) return false;
      return true;
    }));
  }
  return result;
}

export const precisionLabel: Record<Precision, string> = {
  MANUAL: '已标注', PLACE: '楼宇/园区匹配', DISTRICT: '区域参考 · 非办公点', PENDING: '待补充地址', OUTSIDE: '上海市外',
};
