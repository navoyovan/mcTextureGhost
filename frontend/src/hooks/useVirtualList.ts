// frontend/src/hooks/useVirtualList.ts
import { useState, useEffect, useMemo, useCallback } from 'react';

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
  overscan = 10,
}: UseVirtualListOptions) {
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const containerRef = useCallback((node: HTMLElement | null) => {
    setContainerEl(node);
  }, []);

  useEffect(() => {
    if (!containerEl) return;

    setViewportHeight(containerEl.clientHeight || 600);
    setScrollTop(containerEl.scrollTop || 0);

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        if (containerEl) {
          setScrollTop(containerEl.scrollTop);
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

    containerEl.addEventListener('scroll', handleScroll, { passive: true });
    ro.observe(containerEl);

    return () => {
      containerEl.removeEventListener('scroll', handleScroll);
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [containerEl]);

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
    if (!containerEl) return;
    const maxScroll = Math.max(0, headerHeight + itemCount * itemHeight - containerEl.clientHeight);
    if (containerEl.scrollTop > maxScroll && maxScroll >= 0) {
      containerEl.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  }, [containerEl, itemCount, itemHeight, headerHeight]);

  const paddingTop = startIndex * itemHeight;
  const paddingBottom = Math.max(0, (itemCount - endIndex) * itemHeight);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerEl || index < 0 || index >= itemCount) return;
      const itemTop = headerHeight + index * itemHeight;
      const itemBottom = itemTop + itemHeight;
      const bottomThreshold = containerEl.scrollTop + containerEl.clientHeight - 80;
      if (itemTop < containerEl.scrollTop) {
        containerEl.scrollTop = itemTop;
      } else if (itemBottom > bottomThreshold && containerEl.clientHeight > 80) {
        containerEl.scrollTop = itemBottom - (containerEl.clientHeight - 80);
      }
    },
    [containerEl, headerHeight, itemCount, itemHeight]
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
