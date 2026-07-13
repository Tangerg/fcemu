import type { FrameSchedulerPort, ScheduledFrame } from "../../application/ports.js";

export class AnimationFrameScheduler implements FrameSchedulerPort {
  schedule(callback: () => void): ScheduledFrame {
    const requestId = requestAnimationFrame(callback);
    return { cancel: () => cancelAnimationFrame(requestId) };
  }
}
