// Vitest global setup (jsdom).
//
// jsdom ships no canvas backend, so HTMLCanvasElement.getContext() logs a noisy
// "Not implemented: HTMLCanvasElement's getContext() method" error and returns
// null. DotGridBackground (src/components/DotGridBackground.tsx) already bails
// when getContext returns null, so the warning is pure output noise — not a
// failing path. Stub it to return null silently to keep test output clean,
// without pulling in the heavy native `canvas` package.
HTMLCanvasElement.prototype.getContext =
  (() => null) as typeof HTMLCanvasElement.prototype.getContext;
