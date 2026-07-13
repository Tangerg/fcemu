import type { SaveRamStoragePort } from "../../application/ports.js";

const DATABASE_NAME = "fcemu";
const DATABASE_VERSION = 1;
const STORE_NAME = "battery-saves";

export class IndexedDbSaveRamStorage implements SaveRamStoragePort {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  async load(cartridgeId: string): Promise<Uint8Array | undefined> {
    const database = await this.open();
    const value = await request<ArrayBuffer | undefined>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(cartridgeId),
    );
    return value ? new Uint8Array(value) : undefined;
  }

  async save(cartridgeId: string, data: Uint8Array): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(data.slice().buffer, cartridgeId);
    await transactionComplete(transaction);
  }

  private open(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      const openRequest = this.factory.open(DATABASE_NAME, DATABASE_VERSION);
      openRequest.onupgradeneeded = () => {
        if (!openRequest.result.objectStoreNames.contains(STORE_NAME)) {
          openRequest.result.createObjectStore(STORE_NAME);
        }
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () =>
        reject(openRequest.error ?? new Error("Failed to open IndexedDB"));
    });
    return this.databasePromise;
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}
