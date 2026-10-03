// frontend/src/hooks/useVirtualList.ts
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface UseVirtualListOptions {
  itemCount: number;
  itemHeight: number;
  headerHeight?: number;
  overscan?: number;
}

export function useVirtualList({
  itemCount,
  itemHeight,
  headerHeight = 0,
  overscan = 6,
}: UseVirtualListOptions) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setViewportHeight(el.clientHeight || 600);

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        if (el) {
          setScrollTop(el.scrollTop);
        }
        rafId = null;
      });
    };

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setViewportHeight(entry.contentRect.height);
        }
      }
    });

    el.addEventListener('scroll', handleScroll, { passive: true });
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const { startIndex, endIndex } = useMemo(() => {
    if (itemCount <= 0) {
      return { startIndex: 0, endIndex: 0 };
    }
    const adjustedScrollTop = Math.max(0, scrollTop - headerHeight);
    const rawStart = Math.floor(adjustedScrollTop / itemHeight);
    const start = Math.max(0, Math.min(itemCount - 1, rawStart - overscan));
    const visibleCount = Math.ceil(viewportHeight / itemHeight);
    const end = Math.min(itemCount, Math.max(start + 1, rawStart + visibleCount + overscan));
    return { startIndex: start, endIndex: end };
  }, [scrollTop, headerHeight, viewportHeight, itemCount, itemHeight, overscan]);

  // Clamp scroll position when itemCount decreases (e.g. search/filter query)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, headerHeight + itemCount * itemHeight - el.clientHeight);
    if (el.scrollTop > maxScroll && maxScroll >= 0) {
      el.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  }, [itemCount, itemHeight, headerHeight]);

  const paddingTop = startIndex * itemHeight;
  const paddingBottom = Math.max(0, (itemCount - endIndex) * itemHeight);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el || index < 0 || index >= itemCount) return;
      const itemTop = headerHeight + index * itemHeight;
      const itemBottom = itemTop + itemHeight;
      const bottomThreshold = el.scrollTop + el.clientHeight - 80;
      if (itemTop < el.scrollTop) {
        el.scrollTop = itemTop;
      } else if (itemBottom > bottomThreshold && el.clientHeight > 80) {
        el.scrollTop = itemBottom - (el.clientHeight - 80);
      }
    },
    [headerHeight, itemCount, itemHeight]
  );

  return {
    containerRef,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    scrollToIndex,
  };
}
