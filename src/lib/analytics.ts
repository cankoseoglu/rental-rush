// Lightweight GA4 event helper.
//
// No-ops when Google Analytics isn't loaded — local dev, forks without
// NEXT_PUBLIC_GA_ID set, or before gtag.js has finished loading — so callers can
// fire events unconditionally without guarding. The <Analytics> component
// (src/components/Analytics.tsx) is what actually loads gtag.js.

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.gtag?.("event", event, params);
}
