import fs from 'node:fs';
import path from 'node:path';
import {serialize, deserialize} from 'node:v8';
import {randomUUID} from 'node:crypto';
import {MemorySaver} from '@langchain/langgraph';

/** One scheduler-owned worker per task. Atomic snapshots retain LangGraph checkpoints and pending writes. */
export class FileCheckpointer extends MemorySaver {
  constructor(file) {
    super();
    this.file = file;
    this.pending = Promise.resolve();
    if (fs.existsSync(file)) {
      const saved = deserialize(fs.readFileSync(file));
      if (saved.version !== 1 || !saved.storage || !saved.writes) throw new Error('INVALID_CHECKPOINT');
      this.storage = saved.storage;
      this.writes = saved.writes;
    }
  }
  async persist() {
    const bytes = serialize({version: 1, storage: this.storage, writes: this.writes});
    this.pending = this.pending.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), {recursive: true});
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      await fs.promises.writeFile(temporary, bytes, {flag: 'wx'});
      await fs.promises.rename(temporary, this.file);
    });
    await this.pending;
  }
  async put(...args) { const result = await super.put(...args); await this.persist(); return result; }
  async putWrites(...args) { await super.putWrites(...args); await this.persist(); }
}
