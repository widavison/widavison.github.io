type Point = [number, number];
type MotionData = {
  fps: number;
  frames: number;
  width: number;
  height: number;
  trail_seconds: number;
  colors: string[];
  tracks: Point[][];
};

export async function initIamotViewer(root: HTMLElement) {
  if (root.dataset.initialized) return;
  root.dataset.initialized = "true";
  const element = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const video = element<HTMLVideoElement>("[data-iamot-video]");
  const canvas = element<HTMLCanvasElement>("[data-iamot-canvas]");
  const viewport = element<HTMLElement>("[data-iamot-viewport]");
  const poster = element<HTMLImageElement>("[data-iamot-poster]");
  const play = element<HTMLButtonElement>("[data-iamot-play]");
  const timeline = element<HTMLInputElement>("[data-iamot-timeline]");
  const speed = element<HTMLSelectElement>("[data-iamot-speed]");
  const reveal = element<HTMLButtonElement>("[data-iamot-reveal]");
  const time = element<HTMLElement>("[data-iamot-time]");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas drawing is unavailable");
  const response = await fetch(`${root.dataset.assets}tracks.json`);
  if (!response.ok) throw new Error(`Could not load trajectories: ${response.status}`);
  const data: MotionData = await response.json();
  if (data.frames !== data.tracks.length || data.colors.length !== data.tracks[0]?.length) throw new Error("Invalid point-track data");
  const duration = data.frames / data.fps;
  const tail = Math.min(Math.round(.5 * data.fps), data.frames - 1);
  canvas.width = data.width; canvas.height = data.height;
  video.muted = true;
  video.preload = "auto";
  video.src = `${root.dataset.assets}video.mp4`;
  timeline.max = String((data.frames - 1) / data.fps);
  timeline.step = String(1 / data.fps);
  let wantsToPlay = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visible = false, pinned = false, hovered = false, focused = false, disposed = false;
  let callback: number | undefined;
  let animation: number | undefined;
  const events = new AbortController();
  const updateReveal = () => {
    root.dataset.revealed = String(pinned || hovered || focused);
    reveal.setAttribute("aria-pressed", String(pinned));
  };
  const draw = (seconds: number) => {
    const frame = Math.min(data.frames - 1, Math.max(0, Math.floor(seconds * data.fps + .001)));
    canvas.dataset.frame = String(frame);
    const first = frame - tail;
    ctx.clearRect(0, 0, data.width, data.height);
    data.colors.forEach((color, point) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.7; ctx.lineCap = "round";
      for (let index = first + 1; index <= frame; index++) {
        // The trail is cyclic, but never connect the clip's last and first poses.
        if ((index + data.frames) % data.frames === 0) continue;
        const a = data.tracks[(index - 1 + data.frames) % data.frames][point];
        const b = data.tracks[(index + data.frames) % data.frames][point];
        ctx.globalAlpha = .12 + .65 * (index - first) / Math.max(1, tail);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const [x, y] = data.tracks[frame][point];
      ctx.globalAlpha = 1; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3.1, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    timeline.value = String(frame / data.fps);
    timeline.setAttribute("aria-valuetext", `${seconds.toFixed(1)} of ${duration.toFixed(1)} seconds`);
    time.textContent = `${seconds.toFixed(1)} / ${duration.toFixed(1)} s`;
  };
  const updatePlayback = () => {
    play.textContent = video.paused ? "play" : "pause";
    root.dataset.playback = video.paused ? "paused" : "playing";
  };
  const resume = () => {
    if (visible && !document.hidden && wantsToPlay) video.play().catch(updatePlayback);
    else video.pause();
  };
  play.addEventListener("click", () => { wantsToPlay = video.paused; resume(); }, { signal: events.signal });
  timeline.addEventListener("input", () => {
    wantsToPlay = false; video.pause(); video.currentTime = Number(timeline.value);
  }, { signal: events.signal });
  speed.addEventListener("change", () => { video.playbackRate = Number(speed.value); }, { signal: events.signal });
  reveal.addEventListener("click", () => { pinned = !pinned; updateReveal(); }, { signal: events.signal });
  viewport.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") { hovered = true; updateReveal(); }
  }, { signal: events.signal });
  viewport.addEventListener("pointerleave", () => { hovered = false; updateReveal(); }, { signal: events.signal });
  viewport.addEventListener("focus", () => { focused = true; updateReveal(); }, { signal: events.signal });
  viewport.addEventListener("blur", () => { focused = false; updateReveal(); }, { signal: events.signal });
  video.addEventListener("play", updatePlayback, { signal: events.signal });
  video.addEventListener("pause", updatePlayback, { signal: events.signal });
  video.addEventListener("seeked", () => draw(video.currentTime), { signal: events.signal });
  video.addEventListener("loadeddata", () => { draw(video.currentTime); resume(); }, { signal: events.signal });
  document.addEventListener("visibilitychange", resume, { signal: events.signal });
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
  observer.observe(viewport);
  if (typeof video.requestVideoFrameCallback === "function") {
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (disposed) return;
      draw(metadata.mediaTime); callback = video.requestVideoFrameCallback(onFrame);
    };
    callback = video.requestVideoFrameCallback(onFrame);
  } else {
    const tick = () => { if (!disposed) { if (visible && !document.hidden && !video.paused) draw(video.currentTime); animation = requestAnimationFrame(tick); } };
    tick();
  }
  draw(0); updatePlayback(); updateReveal();
  canvas.hidden = false; poster.hidden = true;
  for (const control of [play, timeline, speed, reveal]) control.disabled = false;
  viewport.setAttribute("aria-busy", "false"); root.dataset.ready = "true";
  const dispose = () => {
    disposed = true; video.pause(); observer.disconnect(); events.abort();
    if (callback !== undefined) video.cancelVideoFrameCallback(callback);
    if (animation !== undefined) cancelAnimationFrame(animation);
  };
  window.addEventListener("pagehide", dispose, { once: true });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
