import { IDBFactory as FakeIdbFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { PersistedQuickSave } from "../../application/ports.js";
import { IndexedDbEmulatorStorage } from "./indexed-db-emulator-storage.js";

describe("IndexedDbEmulatorStorage", () => {
  it("upgrades the battery-save database and preserves its existing data", async () => {
    const factory = new FakeIdbFactory();
    const legacyDatabase = await openDatabase(factory, 1, (database) => {
      database.createObjectStore("battery-saves");
    });
    const transaction = legacyDatabase.transaction("battery-saves", "readwrite");
    transaction.objectStore("battery-saves").put(Uint8Array.of(0x42).buffer, "legacy-rom");
    await transactionComplete(transaction);
    legacyDatabase.close();

    const storage = new IndexedDbEmulatorStorage(factory);

    expect(await storage.load("legacy-rom")).toEqual(Uint8Array.of(0x42));
    await storage.saveQuickSave(quickSave({ cartridgeId: "legacy-rom", slot: 2 }));
    expect(await storage.loadQuickSave("legacy-rom", "ntsc", 2)).toMatchObject({
      cartridgeId: "legacy-rom",
      executionRegion: "ntsc",
      slot: 2,
    });
  });

  it("isolates quick saves by ROM, execution region and slot", async () => {
    const factory = new FakeIdbFactory();
    const storage = new IndexedDbEmulatorStorage(factory);
    const ntscSlotOne = quickSave({
      cartridgeId: "rom-a",
      executionRegion: "ntsc",
      slot: 1,
      frameCount: 10,
    });
    const palSlotOne = quickSave({
      cartridgeId: "rom-a",
      executionRegion: "pal",
      slot: 1,
      frameCount: 20,
    });
    const otherRom = quickSave({
      cartridgeId: "rom-b",
      executionRegion: "ntsc",
      slot: 1,
      frameCount: 30,
    });
    const ntscSlotThree = quickSave({
      cartridgeId: "rom-a",
      executionRegion: "ntsc",
      slot: 3,
      frameCount: 40,
    });

    await Promise.all(
      [ntscSlotOne, palSlotOne, otherRom, ntscSlotThree].map((snapshot) =>
        storage.saveQuickSave(snapshot),
      ),
    );

    await expect(storage.loadQuickSave("rom-a", "ntsc", 1)).resolves.toEqual(ntscSlotOne);
    await expect(storage.loadQuickSave("rom-a", "pal", 1)).resolves.toEqual(palSlotOne);
    await expect(storage.loadQuickSave("rom-b", "ntsc", 1)).resolves.toEqual(otherRom);
    await expect(storage.loadQuickSave("rom-a", "ntsc", 3)).resolves.toEqual(ntscSlotThree);
    await expect(storage.loadQuickSave("rom-a", "ntsc", 2)).resolves.toBeUndefined();

    await storage.removeQuickSave("rom-a", "ntsc", 1);

    await expect(storage.loadQuickSave("rom-a", "ntsc", 1)).resolves.toBeUndefined();
    await expect(storage.loadQuickSave("rom-a", "pal", 1)).resolves.toEqual(palSlotOne);
  });

  it("rejects records whose envelope disagrees with the requested storage key", async () => {
    const factory = new FakeIdbFactory();
    const storage = new IndexedDbEmulatorStorage(factory);
    await storage.saveQuickSave(quickSave({ cartridgeId: "rom-a", slot: 1 }));
    const database = await openDatabase(factory, 2);
    const transaction = database.transaction("quick-saves", "readwrite");
    transaction
      .objectStore("quick-saves")
      .put(quickSave({ cartridgeId: "rom-a", slot: 2 }), "rom-a:ntsc:1");
    await transactionComplete(transaction);
    database.close();

    await expect(storage.loadQuickSave("rom-a", "ntsc", 1)).resolves.toBeUndefined();
  });
});

function quickSave({
  cartridgeId,
  executionRegion = "ntsc",
  slot,
  frameCount = 1,
}: {
  readonly cartridgeId: string;
  readonly executionRegion?: "ntsc" | "pal" | "dendy";
  readonly slot: 1 | 2 | 3;
  readonly frameCount?: number;
}): PersistedQuickSave {
  return {
    format: "fcemu-quick-save",
    version: 1,
    cartridgeId,
    executionRegion,
    slot,
    frameCount,
    cpuCycles: frameCount * 100,
    runtimeState: { data: { memory: Uint8Array.of(slot, frameCount) } },
  };
}

function openDatabase(
  factory: IDBFactory,
  version: number,
  upgrade?: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open("fcemu", version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open test database"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Test transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Test transaction aborted"));
  });
}
