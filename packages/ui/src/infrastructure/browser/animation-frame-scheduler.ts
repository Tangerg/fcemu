import type { FrameSchedulerPort, ScheduledFrame } from "../../application/ports.js";

export class AnimationFrameScheduler implements FrameSchedulerPort {
  schedule(callback: (timestamp: number) => void): ScheduledFrame {
    // requestAnimationFrame passes the frame's DOMHighResTimeStamp to the callback.
    const requestId = requestAnimationFrame(callback);
    return { cancel: () => cancelAnimationFrame(requestId) };
  }
}
