import type {CaptureRef} from '../common/desktop/capture';

export interface EvidenceRef {captureId: string; bbox: [number, number, number, number]}
export interface EvidenceField {
  value: string | null; observedText: string | null; certainty: 'CLEAR' | 'UNCERTAIN' | 'MISSING';
  reason: string | null; evidence: EvidenceRef[];
}
export interface VisionCandidate {
  localId: string; title: EvidenceField; companyName: EvidenceField; salaryText: EvidenceField;
  experienceText: EvidenceField; educationText: EvidenceField; locationText: EvidenceField; officeAddress: EvidenceField;
  descriptionSegments: Array<EvidenceField & {segmentOrder: number}>;
  sourceUrl: string | null; missingFields: string[]; issues: string[]; identityEvidence: EvidenceRef[];
}
export interface VisionResult {
  schemaVersion: 1; promptVersion: 'jd-vision-v1'; taskId: string;
  pageKind: 'LIST' | 'DETAIL' | 'LOGIN' | 'CHALLENGE' | 'OTHER' | 'UNKNOWN';
  loginStatus: 'EVIDENCED' | 'LOGIN_REQUIRED' | 'VERIFICATION_REQUIRED' | 'UNKNOWN';
  coverage: 'COMPLETE' | 'PARTIAL' | 'UNREADABLE'; candidates: VisionCandidate[]; issues: string[]; nextCapture: string | null;
}
const fieldNames = ['title', 'companyName', 'salaryText', 'experienceText', 'educationText', 'locationText', 'officeAddress'] as const;

/** Protocol validation is not semantic approval: the main agent must still review the images. */
export function validateVisionResult(value: unknown, taskId: string, captures: CaptureRef[]): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['VISION_INVALID_RESULT'];
  const result = value as VisionResult;
  if (result.schemaVersion !== 1 || result.promptVersion !== 'jd-vision-v1' || result.taskId !== taskId) errors.push('任务或协议版本不匹配');
  if (!['LIST', 'DETAIL', 'LOGIN', 'CHALLENGE', 'OTHER', 'UNKNOWN'].includes(result.pageKind) ||
      !['COMPLETE', 'PARTIAL', 'UNREADABLE'].includes(result.coverage) ||
      !['EVIDENCED', 'LOGIN_REQUIRED', 'VERIFICATION_REQUIRED', 'UNKNOWN'].includes(result.loginStatus)) errors.push('非法状态');
  const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string');
  if (!strings(result.issues) || (result.nextCapture !== null && typeof result.nextCapture !== 'string')) errors.push('缺口格式不正确');
  const evidence = (refs: EvidenceRef[]) => Array.isArray(refs) && refs.every(ref => {
    if (!ref || !captures.some(c => c.captureId === ref.captureId) || !Array.isArray(ref.bbox) || ref.bbox.length !== 4) return false;
    const [x, y, w, h] = ref.bbox;
    return ref.bbox.every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.000001 && y + h <= 1.000001;
  });
  const field = (item: EvidenceField) => item && ['CLEAR', 'UNCERTAIN', 'MISSING'].includes(item.certainty) &&
    (item.value === null || typeof item.value === 'string') && (item.observedText === null || typeof item.observedText === 'string') &&
    (item.reason === null || typeof item.reason === 'string') && evidence(item.evidence) &&
    (!(item.value || item.observedText) || item.evidence.length > 0) &&
    (item.certainty === 'CLEAR' ? Boolean(item.value?.trim()) && Boolean(item.observedText?.trim()) : item.value === null && Boolean(item.reason)) &&
    (item.certainty !== 'MISSING' || item.observedText === null);
  if (!Array.isArray(result.candidates)) return [...errors, '候选必须是数组'];
  const ids = new Set<string>();
  for (const candidate of result.candidates) {
    if (!candidate || typeof candidate.localId !== 'string' || !candidate.localId || ids.has(candidate.localId)) { errors.push('候选编号非法'); continue; }
    ids.add(candidate.localId);
    if (fieldNames.some(name => !field(candidate[name]))) errors.push(candidate.localId + ': 字段证据不完整');
    if (!Array.isArray(candidate.descriptionSegments) || candidate.descriptionSegments.some((item, n) => !field(item) || item.segmentOrder !== n + 1)) errors.push('正文顺序或证据不正确');
    if (!strings(candidate.missingFields) || !strings(candidate.issues) || !evidence(candidate.identityEvidence)) errors.push('候选缺口或身份格式不正确');
    if (candidate.sourceUrl !== null && !captures.some(c => c.sourceUrl === candidate.sourceUrl)) errors.push('来源不是本批真实导航');
    if (result.pageKind === 'LIST' && candidate.descriptionSegments?.length) errors.push('列表不能冒充完整正文');
  }
  if (['LOGIN', 'CHALLENGE'].includes(result.pageKind) && result.candidates.length) errors.push('认证页面不能生成候选');
  return errors;
}

export function archiveEvidenceIssues(result: VisionResult, candidate: VisionCandidate): string[] {
  const issues: string[] = [];
  if (result.pageKind !== 'DETAIL' || result.coverage !== 'COMPLETE') issues.push('需要完整详情截图');
  if (!candidate.sourceUrl || !candidate.title.value || !candidate.companyName.value || !candidate.salaryText.value) issues.push('来源、标题、公司或薪资缺失');
  if ([candidate.title, candidate.companyName, candidate.salaryText].some(field => field.certainty !== 'CLEAR')) issues.push('关键字段尚不确定');
  if (!candidate.identityEvidence.length) issues.push('缺少岗位身份图证据');
  if (['LOGIN_REQUIRED', 'VERIFICATION_REQUIRED'].includes(result.loginStatus)) issues.push('需先完成平台认证');
  if (!candidate.descriptionSegments.length || candidate.descriptionSegments.some(segment => segment.certainty !== 'CLEAR' || !segment.value)) issues.push('正文不完整');
  if (candidate.missingFields.includes('descriptionSegments')) issues.push('正文仍有缺口');
  return issues;
}
