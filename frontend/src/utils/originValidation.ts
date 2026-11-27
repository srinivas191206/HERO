/**
 * Validates cross-window MessageEvent origins using the Baseline/modern Origin API
 * with a safe URL-parser fallback that rejects opaque "null" origins.
 */
export function isTrustedSameOriginEvent(event: MessageEvent): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const OriginCtor = (globalThis as unknown as { Origin?: { from: (input: unknown) => { isSameOrigin: (other: unknown) => boolean } } }).Origin;
    if (OriginCtor && typeof OriginCtor.from === 'function') {
      let candidateOrigin: { isSameOrigin: (other: unknown) => boolean };
      try {
        candidateOrigin = OriginCtor.from(event);
      } catch {
        candidateOrigin = OriginCtor.from(event.origin);
      }
      return candidateOrigin.isSameOrigin(OriginCtor.from(window));
    }

    const candidateUrl = new URL(event.origin);
    const selfUrl = new URL(window.location.href);
    return candidateUrl.origin !== 'null' && candidateUrl.origin === selfUrl.origin;
  } catch {
    return false;
  }
}
