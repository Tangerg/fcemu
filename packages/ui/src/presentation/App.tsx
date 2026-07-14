import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { EmulatorApplication } from "../application/emulator-application.js";
import type { SessionSnapshot } from "../domain/emulation-session.js";
import { parseRegionPreference, REGION_PREFERENCES } from "../domain/execution-region.js";
import "./App.css";
import { formatMapperLabel } from "./mapper-label.js";

const INITIAL_SNAPSHOT: SessionSnapshot = {
  status: "idle",
  audioStatus: "inactive",
  regionPreference: "auto",
  frameCount: 0,
  cpuCycles: 0,
  hasQuickSave: false,
};

export interface AppProps {
  readonly createApplication: (canvas: HTMLCanvasElement) => EmulatorApplication;
}

export function App({ createApplication }: AppProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applicationRef = useRef<EmulatorApplication | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(INITIAL_SNAPSHOT);
  const [isDragging, setDragging] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const application = createApplication(canvasRef.current);
    applicationRef.current = application;
    setSnapshot(application.getSnapshot());
    const unsubscribe = application.subscribe(() => setSnapshot(application.getSnapshot()));
    return () => {
      unsubscribe();
      applicationRef.current = undefined;
      void application.dispose();
    };
  }, [createApplication]);

  const loadFile = (file?: File) => {
    if (file) void applicationRef.current?.loadRom(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files[0]);
  };

  const isRunning = snapshot.status === "running";
  const canToggle = isRunning || snapshot.status === "paused" || snapshot.status === "ready";

  return (
    <main className="workbench">
      <header className="hero enter-one">
        <div className="eyebrow">
          <span className="signal" />
          FC / NES EMULATION LAB
        </div>
        <h1>把一台红白机，装进浏览器。</h1>
        <p>平台无关的模拟器核心，配上一层克制的浏览器工作台。</p>
      </header>

      <section className="console-card enter-two" aria-label="模拟器工作台">
        <div className="screen-shell">
          <div className="screen-header">
            <span>{snapshot.rom?.name ?? snapshot.pendingRomName ?? "NO CARTRIDGE"}</span>
            <span className={`status status-${snapshot.status}`}>{statusLabel(snapshot)}</span>
          </div>
          <div className="screen-bezel">
            <canvas ref={canvasRef} width="256" height="240" aria-label="FC 模拟器画面" />
            {snapshot.status === "idle" && (
              <div className="screen-empty" aria-hidden="true">
                <span className="screen-mark">FC</span>
                <span>INSERT CARTRIDGE</span>
              </div>
            )}
          </div>
        </div>

        <div className="control-panel">
          <div className="metrics" aria-label="运行统计">
            <Metric label="FRAME" value={snapshot.frameCount.toLocaleString()} />
            <Metric label="CPU CYCLES" value={snapshot.cpuCycles.toLocaleString()} />
            <Metric label="MAPPER" value={snapshot.rom ? formatMapperLabel(snapshot.rom) : "—"} />
          </div>

          <fieldset className="region-control">
            <legend>
              <span>EXECUTION REGION</span>
              <strong>ACTIVE {snapshot.rom?.consoleRegion.toUpperCase() ?? "—"}</strong>
            </legend>
            <div className="region-options">
              {REGION_PREFERENCES.map((preference) => (
                <button
                  key={preference}
                  className="region-option"
                  type="button"
                  value={preference}
                  aria-pressed={snapshot.regionPreference === preference}
                  onClick={(event) =>
                    void applicationRef.current?.setRegionPreference(
                      parseRegionPreference(event.currentTarget.value),
                    )
                  }
                >
                  {preference.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>

          {snapshot.error && (
            <p className="error-message" role="alert">
              {snapshot.error}
            </p>
          )}

          <div className="actions">
            <input
              ref={fileInputRef}
              className="rom-input"
              type="file"
              tabIndex={-1}
              aria-hidden="true"
              accept=".nes,application/octet-stream"
              onChange={handleFileChange}
            />
            <button
              className={`rom-picker ${isDragging ? "is-dragging" : ""}`}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span className="picker-title">选择 ROM</span>
              <span className="picker-hint">或拖放 .nes 文件到这里</span>
            </button>

            <button
              className="transport-button"
              type="button"
              disabled={!canToggle}
              onClick={() =>
                void (isRunning ? applicationRef.current?.pause() : applicationRef.current?.play())
              }
            >
              <span className="transport-icon" aria-hidden="true">
                {isRunning ? "Ⅱ" : "▶"}
              </span>
              {isRunning ? "暂停" : "继续"}
            </button>
            <div className="state-actions" aria-label="即时存档">
              <button
                className="state-button"
                type="button"
                disabled={!canToggle}
                onClick={() => applicationRef.current?.quickSaveCurrentState()}
              >
                <span aria-hidden="true">◇</span>
                {snapshot.hasQuickSave ? "覆盖快照" : "保存快照"}
              </button>
              <button
                className="state-button"
                type="button"
                disabled={!canToggle || !snapshot.hasQuickSave}
                onClick={() => void applicationRef.current?.quickLoadCurrentState()}
              >
                <span aria-hidden="true">↶</span>
                恢复快照
              </button>
            </div>
            <p className="controls-hint">
              P1：WASD 移动 · J / K 操作 · Enter 开始 · Space 选择 · P2：方向键移动 · 0 / 1 操作
            </p>
          </div>
        </div>
      </section>

      <footer className="architecture-note enter-three">
        <span>@fcemu/core</span>
        <i />
        domain → application → ports
        <i />
        <span>@fcemu/ui</span>
      </footer>
    </main>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusLabel(snapshot: SessionSnapshot): string {
  const labels = {
    idle: "STANDBY",
    loading: "LOADING",
    ready: "READY",
    running: "RUNNING",
    paused: "PAUSED",
    error: "ERROR",
  } as const;
  const status = labels[snapshot.status];
  return snapshot.status === "running" && snapshot.audioStatus === "blocked"
    ? `${status} · AUDIO BLOCKED`
    : status;
}
