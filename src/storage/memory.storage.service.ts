import { EventEmitter } from "node:events";

export class MemoryStorageService<T> extends EventEmitter {
  protected _items: Map<string, T> = new Map<string, T>();

  public getAllKeys() {
    return Array.from(this._items.keys());
  }

  public get(key: string): T | undefined {
    return this._items.get(key);
  }

  public addOrUpdate(key: string, value: T) {
    const isNew = !this._items.has(key);

    this._items.set(key, value);

    if (isNew) {
      this.emit("add", value);
      return;
    }

    this.emit("update", value);
  }

  public remove(key: string) {
    const elem = this._items.get(key);

    if (elem === undefined) {
      return;
    }

    this.emit("remove", elem);

    this._items.delete(key);
  }
}
