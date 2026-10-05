import {app, screen, type BrowserWindow, type Rectangle} from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const file = () => path.join(app.getPath('userData'), 'window-placement.json');
export function readWindowPlacement(): {bounds?: Rectangle; maximized?: boolean} {
  try {
    const state = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const bounds = state.bounds;
    if (!bounds || !['x', 'y', 'width', 'height'].every(key => Number.isInteger(bounds[key])) ||
        bounds.width < 720 || bounds.height < 700 || bounds.width > 6000 || bounds.height > 6000) return {};
    const visible = screen.getAllDisplays().some(({workArea}) =>
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x) >= 100 &&
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y) >= 100);
    return visible ? {bounds, maximized: state.maximized === true} : {};
  } catch { return {}; }
}
export function saveWindowPlacement(window: BrowserWindow) {
  try {
    fs.mkdirSync(app.getPath('userData'), {recursive: true});
    const temporary = file() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({bounds: window.getNormalBounds(), maximized: window.isMaximized()}));
    fs.renameSync(temporary, file());
  } catch { /* Window closing must still succeed if local storage is unavailable. */ }
}
