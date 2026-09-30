/** Shared process boundary. This file must not import Electron, Node or Vue. */
import type {PlatformCode, PlatformDefinition, PlatformPageState, PageReadResult} from './platform';
export const DESKTOP_REQUEST_CHANNEL = 'jd:desktop:request';
export const DESKTOP_EVENT_CHANNEL = 'jd:desktop:event';

export interface WindowState { maximized: boolean; minimized: boolean }
export interface BrowserState {
  key: string;
  title: string;
  url: string;
  status: 'loading' | 'ready' | 'blank' | 'failed' | 'closed';
  message: string;
  active?: boolean;
  pinned?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  platform?: PlatformCode;
  pageRevision?: number;
}
export interface DesktopCommands {
  'platform.list': {input: Record<string, never>; output: PlatformDefinition[]};
  'platform.open': {input: {platform: PlatformCode}; output: BrowserState};
  'platform.inspect': {input: {platform: PlatformCode; key: string}; output: PlatformPageState};
  'platform.read': {input: {platform: PlatformCode; key: string}; output: PageReadResult};
  'runtime.info': {input: Record<string, never>; output: {version: string; platform: string}};
  'app.retry': {input: Record<string, never>; output: {started: boolean}};
  'window.minimize': {input: Record<string, never>; output: WindowState};
  'window.toggleMaximize': {input: Record<string, never>; output: WindowState};
  'browser.open': {input: {key: string; url: string; title?: string; sessionKey?: string}; output: BrowserState};
  'browser.show': {input: Record<string, never>; output: BrowserState[]};
  'browser.focus': {input: {key: string}; output: BrowserState};
  'browser.navigate': {input: {key: string; url: string}; output: BrowserState};
  'browser.back': {input: {key: string}; output: BrowserState};
  'browser.forward': {input: {key: string}; output: BrowserState};
  'browser.reload': {input: {key: string}; output: BrowserState};
  'window.focus': {input: Record<string, never>; output: WindowState};
  'browser.close': {input: {key: string}; output: BrowserState};
  'browser.list': {input: Record<string, never>; output: BrowserState[]};
  'browser.session': {input: {key: string}; output: {cookieCount: number; persistent: boolean}};
}
export interface DesktopEvents {
  'platform.changed': PlatformPageState;
  'window.changed': WindowState;
  'browser.changed': BrowserState;
}
export type DesktopCommand = keyof DesktopCommands;
export type DesktopEvent = keyof DesktopEvents;
export const DESKTOP_COMMANDS: readonly DesktopCommand[] = [
  'platform.list', 'platform.open', 'platform.inspect', 'platform.read',
  'runtime.info', 'app.retry', 'window.minimize', 'window.toggleMaximize',
  'browser.open', 'browser.close', 'browser.list', 'browser.session',
  'browser.show', 'browser.focus', 'browser.navigate', 'browser.back', 'browser.forward', 'browser.reload', 'window.focus',
];
export type DesktopEnvelope = {[K in DesktopEvent]: {type: K; payload: DesktopEvents[K]}}[DesktopEvent];
export type DesktopResult<T> = {ok: true; data: T} | {ok: false; error: {code: string; message: string}};
export interface NativeDesktopBridge {
  request<K extends DesktopCommand>(command: K, input: DesktopCommands[K]['input']): Promise<DesktopResult<DesktopCommands[K]['output']>>;
  onEvent(callback: (event: DesktopEnvelope) => void): () => void;
}
