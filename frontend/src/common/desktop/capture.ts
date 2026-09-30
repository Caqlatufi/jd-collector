import type {PlatformCode} from './platform';

export interface CaptureRect {x: number; y: number; width: number; height: number}
export interface CaptureRef {
  schemaVersion: 1; captureId: string; batchId: string; platform: PlatformCode; key: string;
  pageRevision: number; sourceUrl: string; pageTitle: string; capturedAt: string;
  filePath: string; sha256: string; viewport: {width: number; height: number}; rect: CaptureRect;
  image: {width: number; height: number}; zoomFactor: number; displayScaleFactor: number;
  sequence: number; parentCaptureId: null;
}
export interface CaptureRequest {key: string; platform: PlatformCode; batchId?: string; rect?: CaptureRect}
export interface VisualAction {
  key: string; platform: PlatformCode; captureId: string; action: 'scroll' | 'click' | 'type' | 'key';
  x?: number; y?: number; deltaX?: number; deltaY?: number; text?: string; replace?: boolean;
  keyCode?: 'Enter' | 'Tab' | 'Escape' | 'Backspace' | 'Delete' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'SelectAll';
  intent?: 'openJob' | 'searchControl' | 'pagination';
}
export interface ActionResult {key: string; action: string; accepted: true; completedAt: string; requiresCapture: true}
