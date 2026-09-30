import {test, expect} from '../native/harness.mjs';
import {validateVisionResult, archiveEvidenceIssues, type VisionResult} from '../../src/account/vision';
import type {CaptureRef} from '../../src/common/desktop/capture';

const sourceUrl = 'https://www.zhipin.com/job_detail/fixture.html';
const captures = [{captureId: 'capture-1', sourceUrl}] as CaptureRef[];
function fixture(): VisionResult {
  const field = (value: string) => ({value, observedText: value, certainty: 'CLEAR' as const, reason: null,
    evidence: [{captureId: 'capture-1', bbox: [0.1, 0.1, 0.3, 0.2] as [number, number, number, number]}]});
  return {schemaVersion: 1, promptVersion: 'jd-vision-v1', taskId: 'fixture', pageKind: 'DETAIL', loginStatus: 'UNKNOWN',
    coverage: 'COMPLETE', issues: [], nextCapture: null, candidates: [{localId: 'card-1', title: field('Java'),
      companyName: field('夹具公司'), salaryText: field('15–25K'), experienceText: field('3年'), educationText: field('本科'),
      locationText: field('上海'), officeAddress: field('夹具地址'), descriptionSegments: [{...field('完整正文'), segmentOrder: 1}],
      sourceUrl, missingFields: [], issues: [], identityEvidence: field('identity').evidence}]};
}
test('视觉协议可校验，但通过协议不代表业务门槛通过', () => {
  const result = fixture();
  expect(validateVisionResult(result, 'fixture', captures)).toEqual([]);
  expect(archiveEvidenceIssues(result, result.candidates[0])).toEqual([]);
});
for (const [name, change] of [
  ['未知截图', (r: VisionResult) => { r.candidates[0].title.evidence[0].captureId = 'invented'; }],
  ['越界bbox', (r: VisionResult) => { r.candidates[0].title.evidence[0].bbox = [0.9, 0, 0.5, 1]; }],
  ['编造来源', (r: VisionResult) => { r.candidates[0].sourceUrl = 'https://example.com/'; }],
  ['不确定字段补值', (r: VisionResult) => { r.candidates[0].title.certainty = 'UNCERTAIN'; }],
  ['列表冒充正文', (r: VisionResult) => { r.pageKind = 'LIST'; }],
  ['认证页面生成岗位', (r: VisionResult) => { r.pageKind = 'CHALLENGE'; }],
  ['重复卡片', (r: VisionResult) => { r.candidates.push(r.candidates[0]); }],
  ['正文顺序错误', (r: VisionResult) => { r.candidates[0].descriptionSegments[0].segmentOrder = 2; }],
] as const) test('拒绝' + name, () => {
  const result = fixture(); change(result);
  expect(validateVisionResult(result, 'fixture', captures).length).toBeGreaterThan(0);
});
test('部分正文、缺失身份或待验证不能进入保存准备', () => {
  const result = fixture(); result.coverage = 'PARTIAL'; result.candidates[0].identityEvidence = [];
  result.loginStatus = 'VERIFICATION_REQUIRED';
  expect(archiveEvidenceIssues(result, result.candidates[0])).toHaveLength(3);
});
test('结构异常作为错误返回，不抛类型访问异常', () => {
  for (const value of [null, [], {}, {candidates: [null]}, {candidates: [{}]}]) {
    expect(validateVisionResult(value, 'fixture', captures).length).toBeGreaterThan(0);
  }
});
