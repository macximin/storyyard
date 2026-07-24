"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const START_EVENT = "storyyard:navigation-start";

export function startNavigationProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [active, setActive] = useState(false);
  const fallbackTimer = useRef<number | null>(null);

  useEffect(() => {
    function stop() {
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
      setActive(false);
      document.documentElement.classList.remove("route-pending");
    }

    const frame = window.requestAnimationFrame(stop);
    return () => window.cancelAnimationFrame(frame);
  }, [routeKey]);

  useEffect(() => {
    function start() {
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
      setActive(true);
      document.documentElement.classList.add("route-pending");
      fallbackTimer.current = window.setTimeout(() => {
        setActive(false);
        document.documentElement.classList.remove("route-pending");
        fallbackTimer.current = null;
      }, 8_000);
    }

    function trackLinkClick(event: MouseEvent) {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const next = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (next.origin !== current.origin) return;
      if (
        next.pathname === current.pathname
        && next.search === current.search
        && next.hash !== current.hash
      ) return;
      if (next.href === current.href) return;
      start();
    }

    window.addEventListener(START_EVENT, start);
    document.addEventListener("click", trackLinkClick, true);
    return () => {
      window.removeEventListener(START_EVENT, start);
      document.removeEventListener("click", trackLinkClick, true);
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
      document.documentElement.classList.remove("route-pending");
    };
  }, []);

  return (
    <>
      <div className={`route-progress ${active ? "active" : ""}`} aria-hidden="true">
        <span />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {active ? "페이지 이동 중" : ""}
      </span>
    </>
  );
}
