// Canvas-based dot-grid background — animated flickering grid with per-dot
// independent phase + speed, DPR-aware canvas sizing, staggered offset on
// alternating rows, reduced-motion single-frame.
//
// Lifecycle:
//   - mount: create canvas, seed dots[], register ResizeObserver, start rAF
//   - unmount: cancel rAF, disconnect observer, remove media-query listener
//   - reduced-motion: draw one static frame, skip rAF loop; still register a
//     `change` listener on the media query so mid-session toggles take effect
//   - SSR/SSG: early-return if `typeof window === 'undefined'`
//
// Pointer-events: `none` (at the wrapper level) so the canvas never
// intercepts terminal interactions. z-index 0 places it behind the terminal
// route shell content (z-index 10 via `.terminal-frame`).

import { useEffect, useRef } from 'react';
import './DotGridBackground.css';

// ── Tuning constants ─────────────────────────────────────────────────────
const DOT_GRID = {
  gap: 26,
  radius: 1.4,
  speedMin: 0.4,
  speedMax: 1.3,
  speedScale: 0.28,
  dotColorCssVar: '--dot-color',
  glowColorCssVar: '--dot-glow',
} as const;

type Dot = {
  x: number;
  y: number;
  phase: number;
  speed: number;
};

export function DotGridBackground(): JSX.Element | null {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // SSR/SSG guard — if the component is statically pre-rendered the effect
    // is simply skipped, and the canvas mounts at hydration time.
    if (typeof window === 'undefined') {
      return;
    }

    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Read palette from CSS custom properties once at mount. Read off the
    // wrapper so scoped overrides (if ever introduced at a parent) take
    // precedence over body-level tokens.
    const cs = getComputedStyle(wrapper);
    const dotColor =
      cs.getPropertyValue(DOT_GRID.dotColorCssVar).trim() ||
      'rgba(180,150,230,0.10)';
    const glowColor =
      cs.getPropertyValue(DOT_GRID.glowColorCssVar).trim() ||
      'rgba(200,160,245,0.55)';

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let dots: Dot[] = [];

    function resize(): void {
      if (!canvas || !ctx) return;
      const r = wrapper!.getBoundingClientRect();
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      const cols = Math.ceil(r.width / DOT_GRID.gap) + 2;
      const rows = Math.ceil(r.height / DOT_GRID.gap) + 2;
      for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          dots.push({
            x: i * DOT_GRID.gap + (j % 2 === 0 ? 0 : DOT_GRID.gap * 0.5),
            y: j * DOT_GRID.gap,
            phase: Math.random() * Math.PI * 2,
            speed:
              DOT_GRID.speedMin +
              Math.random() * (DOT_GRID.speedMax - DOT_GRID.speedMin),
          });
        }
      }
    }

    function draw(now: number): void {
      if (!canvas || !ctx) return;
      const r = wrapper!.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      const t = (now / 1000) * DOT_GRID.speedScale;
      for (const d of dots) {
        const mod = (t * d.speed + d.phase) % 2;
        const lin = mod < 1 ? mod : 2 - mod;
        const intensity = 0.1 + 0.9 * (lin * lin);
        ctx.beginPath();
        ctx.arc(d.x, d.y, DOT_GRID.radius, 0, Math.PI * 2);
        if (intensity > 0.72) {
          ctx.fillStyle = glowColor;
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 10 * (intensity - 0.72) * 3;
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = dotColor;
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 0.3 + intensity * 0.5;
        }
        ctx.fill();
      }
    }

    // rAF handle — captured in this closure so both the loop body and the
    // unmount cleanup can cancel it. Null means "no frame scheduled".
    let rafHandle: number | null = null;

    function loop(now: number): void {
      draw(now);
      rafHandle = window.requestAnimationFrame(loop);
    }

    // Reduced-motion handling — read the match at mount, and listen for
    // mid-session changes so toggles take effect without a reload.
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    function applyReducedMotion(reduced: boolean): void {
      if (rafHandle !== null) {
        window.cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      if (reduced) {
        // Single static frame at t=0.
        draw(0);
      } else {
        rafHandle = window.requestAnimationFrame(loop);
      }
    }

    function handleMqChange(event: MediaQueryListEvent): void {
      applyReducedMotion(event.matches);
    }

    // Resize via ResizeObserver on the wrapper. On resize we rebuild the dots
    // array, and in the reduced-motion case redraw one static frame so the
    // canvas isn't left at a stale size.
    const ro = new ResizeObserver(() => {
      resize();
      if (mq.matches && rafHandle === null) {
        draw(0);
      }
    });
    ro.observe(wrapper);

    // Initial sizing + first frame.
    resize();
    applyReducedMotion(mq.matches);

    // Media-query listener. Both the modern `addEventListener` and the
    // legacy `addListener` APIs exist — prefer modern, fall back for Safari
    // < 14 (the modern API landed in Safari 14 / 2020).
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleMqChange);
    } else {
      // Legacy path — deprecated, but harmless on modern browsers.
      (
        mq as MediaQueryList & {
          addListener: (listener: (e: MediaQueryListEvent) => void) => void;
        }
      ).addListener(handleMqChange);
    }

    return () => {
      if (rafHandle !== null) {
        window.cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      ro.disconnect();
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', handleMqChange);
      } else {
        (
          mq as MediaQueryList & {
            removeListener: (
              listener: (e: MediaQueryListEvent) => void,
            ) => void;
          }
        ).removeListener(handleMqChange);
      }
    };
  }, []);

  return (
    <div className="dot-grid-background" ref={wrapperRef} aria-hidden="true">
      <canvas ref={canvasRef} className="dot-grid-background__canvas" />
    </div>
  );
}
