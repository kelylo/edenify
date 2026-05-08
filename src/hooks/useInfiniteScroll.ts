import { useEffect, useRef, useState } from 'react';

export interface InfiniteScrollOptions {
  fetchMore: () => Promise<void>;
  hasMore: boolean;
  loading: boolean;
  threshold?: number; // px from bottom
}

export function useInfiniteScroll({ fetchMore, hasMore, loading, threshold = 320 }: InfiniteScrollOptions) {
  const [isFetching, setIsFetching] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || loading) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const onIntersect = async (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && !isFetching && hasMore && !loading) {
        setIsFetching(true);
        try {
          await fetchMore();
        } finally {
          setIsFetching(false);
        }
      }
    };

    const observer = new window.IntersectionObserver(onIntersect, {
      root: null,
      rootMargin: `0px 0px ${threshold}px 0px`,
      threshold: 0.01,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, fetchMore, isFetching, threshold]);

  return { sentinelRef, isFetching };
}