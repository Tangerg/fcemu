import type {
  PersistedQuickSave,
  QuickSaveStoragePort,
  SaveRamStoragePort,
} from "../../application/ports.js";
import type { QuickSaveSlot } from "../../domain/emulation-session.js";
import type { ExecutionRegion } from "../../domain/execution-region.js";

const DATABASE_NAME = "fcemu";
const DATABASE_VERSION = 2;
const BATTERY_SAVE_STORE = "battery-saves";
const QUICK_SAVE_STORE = "quick-saves";

export class IndexedDbEmulatorStorage implements SaveRamStoragePort, QuickSaveStoragePort {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  async load(cartridgeId: string): Promise<Uint8Array | undefined> {
    const database = await this.open();
    const value = await request<ArrayBuffer | undefined>(
      database
        .transaction(BATTERY_SAVE_STORE, "readonly")
        .objectStore(BATTERY_SAVE_STORE)
        .get(cartridgeId),
    );
    return value ? new Uint8Array(value) : undefined;
  }

  async save(cartridgeId: string, data: Uint8Array): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(BATTERY_SAVE_STORE, "readwrite");
    transaction.objectStore(BATTERY_SAVE_STORE).put(data.slice().buffer, cartridgeId);
    await transactionComplete(transaction);
  }

  async loadQuickSave(
    cartridgeId: string,
    executionRegion: ExecutionRegion,
    slot: QuickSaveSlot,
  ): Promise<PersistedQuickSave | undefined> {
    const database = await this.open();
    const value = await request<unknown>(
      database
        .transaction(QUICK_SAVE_STORE, "readonly")
        .objectStore(QUICK_SAVE_STORE)
        .get(quickSaveKey(cartridgeId, executionRegion, slot)),
    );
    return isPersistedQuickSave(value) &&
      value.cartridgeId === cartridgeId &&
      value.executionRegion === executionRegion &&
      value.slot === slot
      ? value
      : undefined;
  }

  async saveQuickSave(snapshot: PersistedQuickSave): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(QUICK_SAVE_STORE, "readwrite");
    transaction
      .objectStore(QUICK_SAVE_STORE)
      .put(snapshot, quickSaveKey(snapshot.cartridgeId, snapshot.executionRegion, snapshot.slot));
    await transactionComplete(transaction);
  }

  async removeQuickSave(
    cartridgeId: string,
    executionRegion: ExecutionRegion,
    slot: QuickSaveSlot,
  ): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(QUICK_SAVE_STORE, "readwrite");
    transaction
      .objectStore(QUICK_SAVE_STORE)
      .delete(quickSaveKey(cartridgeId, executionRegion, slot));
    await transactionComplete(transaction);
  }

  private open(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      let settled = false;
      const openRequest = this.factory.open(DATABASE_NAME, DATABASE_VERSION);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        this.databasePromise = undefined;
        reject(error);
      };
      openRequest.onupgradeneeded = () => {
        createStoreIfMissing(openRequest.result, BATTERY_SAVE_STORE);
        createStoreIfMissing(openRequest.result, QUICK_SAVE_STORE);
      };
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        if (settled) {
          database.close();
          return;
        }
        settled = true;
        database.onversionchange = () => {
          database.close();
          this.databasePromise = undefined;
        };
        resolve(database);
      };
      openRequest.onerror = () => fail(openRequest.error ?? new Error("Failed to open IndexedDB"));
      openRequest.onblocked = () => fail(new Error("IndexedDB upgrade was blocked"));
    });
    return this.databasePromise;
  }
}

function quickSaveKey(
  cartridgeId: string,
  executionRegion: ExecutionRegion,
  slot: QuickSaveSlot,
): string {
  return `${cartridgeId}:${executionRegion}:${slot}`;
}

function createStoreIfMissing(database: IDBDatabase, name: string): void {
  if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
}

function isPersistedQuickSave(value: unknown): value is PersistedQuickSave {
  if (!isRecord(value) || !isRecord(value.runtimeState)) return false;
  return (
    value.format === "fcemu-quick-save" &&
    value.version === 1 &&
    typeof value.cartridgeId === "string" &&
    isExecutionRegion(value.executionRegion) &&
    isQuickSaveSlot(value.slot) &&
    Number.isSafeInteger(value.frameCount) &&
    Number(value.frameCount) >= 0 &&
    Number.isSafeInteger(value.cpuCycles) &&
    Number(value.cpuCycles) >= 0 &&
    "data" in value.runtimeState
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function isExecutionRegion(value: unknown): value is ExecutionRegion {
  return value === "ntsc" || value === "pal" || value === "dendy";
}

function isQuickSaveSlot(value: unknown): value is QuickSaveSlot {
  return value === 1 || value === 2 || value === 3;
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
