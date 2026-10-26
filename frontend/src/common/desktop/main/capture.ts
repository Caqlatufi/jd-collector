import {screen, type BrowserWindow, type WebContentsView} from 'electron';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {renameSync} from 'node:fs';
import path from 'node:path';
import type {CaptureRef, CaptureRequest, VisualAction, ActionResult, CaptureRect} from '../capture';
import {PlatformOperationError} from './browserWindows';

export interface VisualTarget {
  view: WebContentsView; host: BrowserWindow; revision: number; epoch: number;
  sourceUrl: string; title: string; background?: boolean;
}
interface StoredCapture {ref: CaptureRef; epoch: number; bitmap: Buffer; geometry: string}
const fail = (code: string, message: string): never => { throw new PlatformOperationError(code, message); };
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');

/** Only native pixels and input; never executes page code or exposes files through renderer IPC. */
export class VisualCapture {
  private busy = false;
  private disposed = false;
  private readonly batches = new Map<string, CaptureRef[]>();
  private readonly latest = new Map<string, StoredCapture>();
  private searchTarget?: {key: string; epoch: number; revision: number; time: number};
  constructor(private readonly root: string,
              private readonly target: (request: CaptureRequest, action?: VisualAction['action']) => VisualTarget) {}
  dispose() { this.disposed = true; this.latest.clear(); this.searchTarget = undefined; }
  private async exclusive<T>(operation: (assertActive: () => void) => Promise<T>): Promise<T> {
    if (this.busy) fail('READ_BUSY', '原生操作进行中，请等待结果');
    if (this.disposed) fail('TAB_NOT_FOUND', '客户端已退出');
    this.busy = true;
    const deadline = Date.now() + 12000;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const assertActive = () => {
      if (expired || Date.now() >= deadline) fail('CAPTURE_TIMEOUT', '原生操作超时，迟到结果不发布');
      if (this.disposed) fail('TAB_NOT_FOUND', '客户端已退出');
    };
    // A timeout ends the caller's wait, not the underlying native/file operation.
    // Keep the lock until it settles, and never publish or send input after the deadline.
    const running = Promise.resolve().then(() => operation(assertActive)).finally(() => {
      if (timer) clearTimeout(timer);
      this.busy = false;
    });
    return Promise.race([running, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        this.latest.clear();
        this.searchTarget = undefined;
        reject(new PlatformOperationError('CAPTURE_TIMEOUT', '原生操作超时，不自动重试'));
      }, 12000);
    })]);
  }
  private geometry(target: VisualTarget): string {
    return JSON.stringify([target.view.getBounds(), target.view.webContents.getZoomFactor(),
      screen.getDisplayMatching(target.host.getBounds()).scaleFactor, target.host.getBounds(), target.epoch]);
  }
  private rect(target: VisualTarget, rect?: CaptureRect): CaptureRect {
    const {width, height} = target.view.getBounds();
    const result = rect || {x: 0, y: 0, width, height};
    if (typeof result !== 'object' || Object.keys(result).length !== 4 || !['x', 'y', 'width', 'height'].every(key => Number.isInteger(result[key as keyof CaptureRect])) || result.x < 0 || result.y < 0 ||
      result.width <= 0 || result.height <= 0 || result.x + result.width > width || result.y + result.height > height)
      fail('INVALID_CAPTURE_RECT', '截图区域必须位于目标可见区域内');
    return result;
  }
  private unchanged(request: CaptureRequest, original: VisualTarget, geometry: string, action?: VisualAction['action']) {
    const current = this.target(request, action);
    if (this.disposed || current.revision !== original.revision || current.sourceUrl !== original.sourceUrl ||
        current.view !== original.view || this.geometry(current) !== geometry)
      fail('PAGE_CHANGED', '页面、焦点或几何已改变，请重新截图');
    return current;
  }
  async capture(request: CaptureRequest): Promise<CaptureRef> {
    const started = Date.now();
    return this.exclusive(async assertActive => {
      if (request.batchId && !this.batches.has(request.batchId)) fail('WORKFLOW_REJECTED', '批次不属于本次客户端');
      const target = this.target(request);
      const geometry = this.geometry(target);
      const rect = this.rect(target, request.rect);
      const native = await target.view.webContents.capturePage(rect, {stayHidden: Boolean(target.background)});
      assertActive();
      this.unchanged(request, target, geometry);
      if (Date.now() - started >= 12000) fail('CAPTURE_TIMEOUT', '截图超时，结果未发布');
      if (native.isEmpty()) fail('CAPTURE_EMPTY', '截图为空，请核实页面');
      const png = native.toPNG();
      const image = {width: png.readUInt32BE(16), height: png.readUInt32BE(20)};
      if (png.length > 20 * 1024 * 1024 || image.width > 8192 || image.height > 8192)
        fail('CAPTURE_TOO_LARGE', '图片过大，请分段截图');
      const batchId = request.batchId || randomUUID();
      const captureId = randomUUID();
      const captures = this.batches.get(batchId) || [];
      const directory = path.join(this.root, batchId);
      const {width, height} = target.view.getBounds();
      const ref: CaptureRef = {schemaVersion: 1, batchId, captureId, key: request.key, platform: request.platform,
        pageRevision: target.revision, sourceUrl: target.sourceUrl, pageTitle: target.title,
        capturedAt: new Date().toISOString(), filePath: path.join(directory, captureId + '.png'), sha256: hash(png),
        viewport: {width, height}, rect, image, zoomFactor: target.view.webContents.getZoomFactor(),
        displayScaleFactor: screen.getDisplayMatching(target.host.getBounds()).scaleFactor,
        sequence: captures.length + 1, parentCaptureId: null};
      try {
        await mkdir(directory, {recursive: true});
        assertActive();
        await writeFile(ref.filePath, png, {flag: 'wx'});
        assertActive();
        this.unchanged(request, target, geometry);
        if (Date.now() - started >= 12000) fail('CAPTURE_TIMEOUT', '截图写入超时，结果未发布');
        const manifest = path.join(directory, 'manifest.json');
        const temporary = path.join(directory, captureId + '.json.tmp');
        await writeFile(temporary, JSON.stringify({schemaVersion: 1, captures: [...captures, ref]}, null, 2), {flag: 'wx'});
        assertActive();
        this.unchanged(request, target, geometry);
        // Commit the tiny manifest without an async gap after the final deadline/target check.
        renameSync(temporary, manifest);
      } catch (error) {
        if (error instanceof PlatformOperationError) throw error;
        fail('CAPTURE_WRITE_FAILED', '图片证据写入失败，未返回有效引用');
      }
      this.batches.set(batchId, [...captures, ref]);
      this.latest.set(request.key, {ref, bitmap: native.toBitmap(), geometry, epoch: target.epoch});
      return ref;
    });
  }
  async act(request: VisualAction): Promise<ActionResult> {
    const started = Date.now();
    return this.exclusive(async assertActive => {
      const target = this.target(request, request.action);
      const stored = this.latest.get(request.key);
      if (!stored || stored.ref.captureId !== request.captureId || stored.ref.platform !== request.platform ||
          Date.now() - Date.parse(stored.ref.capturedAt) > 30000 || stored.geometry !== this.geometry(target) ||
          stored.ref.pageRevision !== target.revision || stored.ref.sourceUrl !== target.sourceUrl)
        fail('STALE_CAPTURE', '截图已过期或页面改变，请重新截图');
      const evidence = stored!;
      if (request.action === 'type' || request.action === 'key') {
        if (request.action === 'type' && (typeof request.text !== 'string' || !request.text.length || request.text.length > 200 || /[\x00-\x1f\x7f]/.test(request.text) ||
            (request.replace !== undefined && typeof request.replace !== 'boolean')))
          fail('WORKFLOW_REJECTED', '搜索文字必须为1至200个字符且不含控制字符');
        if (request.action === 'key' && !['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'SelectAll', 'ZoomIn', 'ZoomOut', 'ZoomReset'].includes(request.keyCode || ''))
          fail('WORKFLOW_REJECTED', '仅允许搜索控件按键和页面缩放');
        const context = this.searchTarget;
        if (!request.keyCode?.startsWith('Zoom') && (!context || context.key !== request.key || context.epoch !== target.epoch || context.revision !== target.revision || Date.now() - context.time > 30000))
          fail('SEARCH_TARGET_REQUIRED', '请先基于截图点击搜索输入框');
      } else {
        const {width, height} = target.view.getBounds();
        if (!Number.isInteger(request.x) || !Number.isInteger(request.y) || request.x! < evidence.ref.rect.x ||
            request.y! < evidence.ref.rect.y || request.x! >= evidence.ref.rect.x + evidence.ref.rect.width ||
            request.y! >= evidence.ref.rect.y + evidence.ref.rect.height)
          fail('INVALID_COORDINATE', '坐标必须位于本次截图覆盖区域');
        if (request.action === 'scroll' && (!Number.isInteger(request.deltaX) || !Number.isInteger(request.deltaY) ||
            Math.abs(request.deltaX!) > width || Math.abs(request.deltaY!) > height || (!request.deltaX && !request.deltaY)))
          fail('INVALID_COORDINATE', '每次滚动不得超过一个可见区域');
        if (request.action === 'click' && !['openJob', 'searchControl', 'pagination'].includes(request.intent || ''))
          fail('WORKFLOW_REJECTED', '点击仅允许岗位、搜索控件或翻页');
      }
      const currentImage = await target.view.webContents.capturePage(evidence.ref.rect, {stayHidden: Boolean(target.background)});
      assertActive();
      this.unchanged(request, target, evidence.geometry, request.action);
      if (Date.now() - started >= 12000) fail('CAPTURE_TIMEOUT', '操作前核实超时，未发送输入');
      if (!currentImage.toBitmap().equals(evidence.bitmap)) fail('STALE_CAPTURE', '可见画面已变化，请重新截图确认');
      this.latest.delete(request.key);
      this.searchTarget = undefined;
      const contents = target.view.webContents;
      const press = (key: string) => {
        const keyCode = key === 'ZoomIn' ? '+' : key === 'ZoomOut' ? '-' : key === 'ZoomReset' ? '0' : key === 'SelectAll' ? 'A' : key.replace('Arrow', '');
        const modifiers: ('control' | 'meta')[] = key === 'SelectAll' || key.startsWith('Zoom') ? [process.platform === 'darwin' ? 'meta' : 'control'] : [];
        contents.sendInputEvent({type: 'keyDown', keyCode, modifiers});
        if (key === 'Enter') contents.sendInputEvent({type: 'char', keyCode: '\r'});
        contents.sendInputEvent({type: 'keyUp', keyCode, modifiers});
      };
      if (request.action === 'type') {
        if (request.replace) press('SelectAll');
        await contents.insertText(request.text!);
      }
      else if (request.action === 'key') press(request.keyCode!);
      else if (request.action === 'scroll') contents.sendInputEvent({type: 'mouseWheel', x: request.x!, y: request.y!,
        deltaX: request.deltaX!, deltaY: request.deltaY!, canScroll: true});
      else {
        contents.sendInputEvent({type: 'mouseDown', x: request.x!, y: request.y!, button: 'left', clickCount: 1});
        contents.sendInputEvent({type: 'mouseUp', x: request.x!, y: request.y!, button: 'left', clickCount: 1});
      }
      // Preserve editing context through our own input; navigation or focus changes still invalidate it.
      if (request.intent === 'searchControl' || request.action === 'type' ||
          (request.action === 'key' && !request.keyCode?.startsWith('Zoom') && !['Enter', 'Tab', 'Escape'].includes(request.keyCode!))) {
        await new Promise(resolve => setTimeout(resolve, 50));
        try {
          const current = this.target(request, request.action);
          if (current.revision === target.revision) this.searchTarget = {key: request.key, epoch: current.epoch, revision: current.revision, time: Date.now()};
        } catch { /* A submitted search may already have navigated; it is not an input target. */ }
      }
      return {key: request.key, action: request.action, accepted: true, completedAt: new Date().toISOString(), requiresCapture: true};
    });
  }
}
