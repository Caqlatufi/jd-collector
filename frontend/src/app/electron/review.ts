import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateVisionResult, archiveEvidenceIssues, type VisionResult} from '../../account/vision';
import type {CaptureRef} from '../../common/desktop/capture';

/** Offline, read-only evidence gate. Semantic review and authorized HTTP saves remain the main agent's responsibility. */
async function main() {
  const [taskFile, resultFile, ...extra] = process.argv.slice(2);
  if (!taskFile || !resultFile || extra.length) throw new Error('用法: node dist-electron/review.cjs <task.json> <result.json>');
  const task = JSON.parse(await readFile(taskFile, 'utf8')) as {taskId: string; captures: CaptureRef[]};
  const result = JSON.parse(await readFile(resultFile, 'utf8')) as VisionResult;
  if (!task.taskId || !Array.isArray(task.captures) || !task.captures.length) throw new Error('任务缺少截图');
  for (const capture of task.captures) {
    const png = await readFile(capture.filePath);
    if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        createHash('sha256').update(png).digest('hex') !== capture.sha256 ||
        png.readUInt32BE(16) !== capture.image.width || png.readUInt32BE(20) !== capture.image.height) throw new Error('图片哈希或尺寸不匹配');
  }
  const errors = validateVisionResult(result, task.taskId, task.captures);
  const candidates = errors.length ? [] : result.candidates.map(candidate => ({
    localId: candidate.localId, evidenceIssues: archiveEvidenceIssues(result, candidate),
  }));
  const ok = !errors.length && candidates.length > 0 && candidates.every(candidate => !candidate.evidenceIssues.length);
  console.log(JSON.stringify({ok, taskId: task.taskId, errors, candidates, semanticApproval: false}, null, 2));
  if (!ok) process.exitCode = 1;
}
void main().catch(() => { console.error('证据校验失败：检查任务、识别JSON与原始PNG；未执行任何保存。'); process.exitCode = 1; });
