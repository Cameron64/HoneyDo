import { useRef, useCallback, useState } from 'react';

interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // Minimum swipe distance to trigger action
  preventScroll?: boolean;
}

interface SwipeState {
  offsetX: number;
  isSwiping: boolean;
  direction: 'left' | 'right' | null;
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  preventScroll = false,
}: SwipeConfig) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);
  const isSwipeGesture = useRef<boolean | null>(null);

  const [swipeState, setSwipeState] = useState<SwipeState>({
    offsetX: 0,
    isSwiping: false,
    direction: null,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentX.current = e.touches[0].clientX;
    isSwipeGesture.current = null; // Reset determination
    setSwipeState({ offsetX: 0, isSwiping: false, direction: null });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
    const deltaX = touchCurrentX.current - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Determine if this is a horizontal swipe or vertical scroll (only once per gesture)
    if (isSwipeGesture.current === null) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Need at least 10px movement to determine direction
      if (absX > 10 || absY > 10) {
        isSwipeGesture.current = absX > absY;
      }
    }

    // If determined to be a horizontal swipe
    if (isSwipeGesture.current) {
      if (preventScroll) {
        e.preventDefault();
      }

      // Limit swipe distance to threshold * 1.5 for visual capping
      const cappedOffset = Math.max(Math.min(deltaX, threshold * 1.5), -threshold * 1.5);
      const direction = deltaX > 0 ? 'right' : deltaX < 0 ? 'left' : null;

      setSwipeState({
        offsetX: cappedOffset,
        isSwiping: true,
        direction,
      });
    }
  }, [threshold, preventScroll]);

  const handleTouchEnd = useCallback((_e?: React.TouchEvent) => {
    const deltaX = touchCurrentX.current - touchStartX.current;

    // Only trigger if it was a horizontal swipe gesture
    if (isSwipeGesture.current) {
      if (deltaX > threshold && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < -threshold && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    // Reset state with animation
    setSwipeState({ offsetX: 0, isSwiping: false, direction: null });
    isSwipeGesture.current = null;
  }, [threshold, onSwipeLeft, onSwipeRight]);

  const handlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };

  // Calculate reveal percentage (0-1) for visual indicators
  const revealPercent = Math.min(Math.abs(swipeState.offsetX) / threshold, 1);

  return {
    handlers,
    swipeState,
    revealPercent,
    isThresholdMet: Math.abs(swipeState.offsetX) >= threshold,
  };
}
