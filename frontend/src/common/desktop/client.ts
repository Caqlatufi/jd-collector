import type {DesktopCommand, DesktopCommands, DesktopEnvelope, DesktopEvent, DesktopEvents, NativeDesktopBridge} from './contract';

declare global { interface Window { jdDesktop?: NativeDesktopBridge } }

export class DesktopError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'DesktopError'; }
}
const native = (): NativeDesktopBridge | undefined => typeof window === 'undefined' ? undefined : window.jdDesktop;

export const desktop = {
  available: (): boolean => Boolean(native()),
  async request<K extends DesktopCommand>(command: K, input: DesktopCommands[K]['input']): Promise<DesktopCommands[K]['output']> {
    const bridge = native();
    if (!bridge) throw new DesktopError('DESKTOP_UNAVAILABLE', '此能力需要在桌面客户端中使用');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        bridge.request(command, input),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DesktopError('DESKTOP_TIMEOUT', '桌面操作等待超时，请检查实际状态后再试')), 20_000); }),
      ]);
      if (!result.ok) throw new DesktopError(result.error.code, result.error.message);
      return result.data;
    } finally { if (timer) clearTimeout(timer); }
  },
  on<K extends DesktopEvent>(type: K, callback: (payload: DesktopEvents[K]) => void): () => void {
    const bridge = native();
    if (!bridge) return () => {};
    return bridge.onEvent((event: DesktopEnvelope) => {
      if (event.type === type) callback(event.payload as DesktopEvents[K]);
    });
  },
};
