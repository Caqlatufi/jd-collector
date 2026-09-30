import {contextBridge, ipcRenderer} from 'electron';
import {DESKTOP_COMMANDS, DESKTOP_EVENT_CHANNEL, DESKTOP_REQUEST_CHANNEL} from '../../common/desktop/contract';
import type {DesktopEnvelope, NativeDesktopBridge} from '../../common/desktop/contract';

const bridge: NativeDesktopBridge = {
  request(command, input) {
    if (!DESKTOP_COMMANDS.includes(command)) return Promise.resolve({ok: false, error: {code: 'UNKNOWN_COMMAND', message: '不支持的桌面命令'}});
    return ipcRenderer.invoke(DESKTOP_REQUEST_CHANNEL, command, input);
  },
  onEvent(callback) {
    const listener = (_event: Electron.IpcRendererEvent, payload: DesktopEnvelope) => callback(payload);
    ipcRenderer.on(DESKTOP_EVENT_CHANNEL, listener);
    return () => ipcRenderer.removeListener(DESKTOP_EVENT_CHANNEL, listener);
  },
};
contextBridge.exposeInMainWorld('jdDesktop', bridge);
