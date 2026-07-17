import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { EmulatorApplication } from "../application/emulator-application.js";
import type { EmulatorApplicationDiagnostics } from "../application/emulator-application.js";
import { QUICK_SAVE_SLOTS } from "../domain/emulation-session.js";
import type { QuickSaveSlot, SessionSnapshot } from "../domain/emulation-session.js";
import { parseRegionPreference, REGION_PREFERENCES } from "../domain/execution-region.js";
import "./App.css";
import { formatMapperLabel } from "./mapper-label.js";

const INITIAL_SNAPSHOT: SessionSnapshot = {
  status: "idle",
  audioStatus: "inactive",
  regionPreference: "auto",
  frameCount: 0,
  cpuCycles: 0,
  selectedQuickSaveSlot: 1,
  quickSaveSlots: [],
  hasQuickSave: false,
};

const INITIAL_DIAGNOSTICS: EmulatorApplicationDiagnostics = {
  actualFrameRateHz: 0,
  targetFrameRateHz: 0,
  audio: {
    sampleRate: 44_100,
    underruns: 0,
    droppedSamples: 0,
    pendingSamples: 0,
    bufferedSamples: 0,
  },
};

export interface AppProps {
  readonly createApplication: (canvas: HTMLCanvasElement) => EmulatorApplication;
}

export function App({ createApplication }: AppProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applicationRef = useRef<EmulatorApplication | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(INITIAL_SNAPSHOT);
  const [diagnostics, setDiagnostics] =
    useState<EmulatorApplicationDiagnostics>(INITIAL_DIAGNOSTICS);
  const [isDragging, setDragging] = useState(false);
  const [quickSaveRemovalConfirmation, setQuickSaveRemovalConfirmation] = useState<
    QuickSaveSlot | undefined
  >();

  useEffect(() => {
    if (!canvasRef.current) return;
    const application = createApplication(canvasRef.current);
    applicationRef.current = application;
    setSnapshot(application.getSnapshot());
    setDiagnostics(application.getDiagnostics());
    const unsubscribe = application.subscribe(() => {
      setSnapshot(application.getSnapshot());
      setDiagnostics(application.getDiagnostics());
    });
    return () => {
      unsubscribe();
      applicationRef.current = undefined;
      void application.dispose();
    };
  }, [createApplication]);

  useEffect(() => {
    setQuickSaveRemovalConfirmation(undefined);
  }, [snapshot.selectedQuickSaveSlot, snapshot.hasQuickSave]);

  const focusGameplay = () => {
    if (!applicationRef.current?.getSnapshot().rom) return;
    canvasRef.current?.focus({ preventScroll: true });
  };

  const runApplicationAction = (
    action: (application: EmulatorApplication) => void | Promise<void>,
  ) => {
    const application = applicationRef.current;
    if (!application) return;
    void action(application);
    focusGameplay();
  };

  const loadFile = (file?: File) => {
    const application = applicationRef.current;
    if (!file || !application) return;
    void application.loadRom(file).then(() => {
      if (applicationRef.current === application) focusGameplay();
    });
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

  const handleQuickSaveRemoval = () => {
    const slot = snapshot.selectedQuickSaveSlot;
    if (quickSaveRemovalConfirmation !== slot) {
      setQuickSaveRemovalConfirmation(slot);
      return;
    }
    setQuickSaveRemovalConfirmation(undefined);
    runApplicationAction((application) => application.removeCurrentQuickSave());
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
            <canvas
              ref={canvasRef}
              width="256"
              height="240"
              tabIndex={0}
              aria-label="FC 模拟器画面"
              aria-describedby="controller-help"
            />
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
            <Metric
              label="FPS ACT / TARGET"
              value={`${formatRate(diagnostics.actualFrameRateHz)} / ${formatRate(
                diagnostics.targetFrameRateHz,
              )}`}
            />
            <Metric
              label="AUDIO MS RING / QUEUE"
              value={`${formatAudioMilliseconds(
                diagnostics.audio.bufferedSamples,
                diagnostics.audio.sampleRate,
              )} / ${formatAudioMilliseconds(
                diagnostics.audio.pendingSamples,
                diagnostics.audio.sampleRate,
              )}`}
            />
            <Metric
              label="XRUN / DROPPED"
              value={`${diagnostics.audio.underruns} / ${diagnostics.audio.droppedSamples}`}
            />
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
                    runApplicationAction((application) =>
                      application.setRegionPreference(
                        parseRegionPreference(event.currentTarget.value),
                      ),
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
                runApplicationAction((application) =>
                  isRunning ? application.pause() : application.play(),
                )
              }
            >
              <span className="transport-icon" aria-hidden="true">
                {isRunning ? "Ⅱ" : "▶"}
              </span>
              {isRunning ? "暂停" : "继续"}
            </button>
            <div className="machine-actions" aria-label="主机控制">
              <button
                className="state-button machine-button"
                type="button"
                disabled={!canToggle}
                aria-label="软复位，保留内存与电池存档"
                onClick={() => runApplicationAction((application) => application.reset())}
              >
                <span aria-hidden="true">↻</span>
                软复位
              </button>
              <button
                className="state-button machine-button"
                type="button"
                disabled={!canToggle}
                aria-label="重新开机，清除易失内存并保留电池存档"
                onClick={() => runApplicationAction((application) => application.powerCycle())}
              >
                <span aria-hidden="true">⏻</span>
                重新开机
              </button>
            </div>
            <div className="quick-save-slots" aria-label="快速存档槽位">
              {QUICK_SAVE_SLOTS.map((slot) => {
                const isSelected = snapshot.selectedQuickSaveSlot === slot;
                const hasSave = snapshot.quickSaveSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    className="quick-save-slot"
                    type="button"
                    aria-label={`槽位 ${slot}${hasSave ? "，已有存档" : "，空"}`}
                    aria-pressed={isSelected}
                    data-saved={hasSave || undefined}
                    disabled={!canToggle}
                    onClick={() =>
                      runApplicationAction((application) => application.selectQuickSaveSlot(slot))
                    }
                  >
                    <span>SLOT {slot}</span>
                    <i aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="state-actions" aria-label="快速存档操作">
              <button
                className="state-button"
                type="button"
                disabled={!canToggle}
                onClick={() =>
                  runApplicationAction((application) => application.quickSaveCurrentState())
                }
              >
                <span aria-hidden="true">◇</span>
                {snapshot.hasQuickSave ? "覆盖槽位" : "保存槽位"}
              </button>
              <button
                className="state-button"
                type="button"
                disabled={!canToggle || !snapshot.hasQuickSave}
                onClick={() =>
                  runApplicationAction((application) => application.quickLoadCurrentState())
                }
              >
                <span aria-hidden="true">↶</span>
                读取槽位
              </button>
              <button
                className="state-button state-button-danger"
                type="button"
                disabled={!canToggle || !snapshot.hasQuickSave}
                aria-label={`${
                  quickSaveRemovalConfirmation === snapshot.selectedQuickSaveSlot
                    ? "确认清空"
                    : "清空"
                }槽位 ${snapshot.selectedQuickSaveSlot}`}
                data-confirm={
                  quickSaveRemovalConfirmation === snapshot.selectedQuickSaveSlot || undefined
                }
                onBlur={() => setQuickSaveRemovalConfirmation(undefined)}
                onClick={handleQuickSaveRemoval}
              >
                <span aria-hidden="true">×</span>
                <span aria-live="polite">
                  {quickSaveRemovalConfirmation === snapshot.selectedQuickSaveSlot
                    ? "确认清空"
                    : "清空槽位"}
                </span>
              </button>
            </div>
            <p id="controller-help" className="controls-hint">
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

function formatRate(rate: number): string {
  return rate > 0 ? rate.toFixed(1) : "—";
}

function formatAudioMilliseconds(samples: number, sampleRate: number): string {
  if (sampleRate <= 0) return "—";
  return ((samples * 1000) / sampleRate).toFixed(1);
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
