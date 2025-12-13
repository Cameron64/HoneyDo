import { useRef, useCallback } from 'react';

interface LongPressConfig {
  onLongPress: () => void;
  onPress?: () => void;
  threshold?: number; // Duration in ms to trigger long press
  cancelOnMove?: boolean; // Cancel if user moves finger
  moveThreshold?: number; // How much movement cancels the press
}

export function useLongPress({
  onLongPress,
  onPress,
  threshold = 500,
  cancelOnMove = true,
  moveThreshold = 10,
}: LongPressConfig) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Prevent text selection on long press
    e.preventDefault();

    isLongPressRef.current = false;
    startPosRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      onLongPress();
    }, threshold);
  }, [onLongPress, threshold]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!cancelOnMove || !startPosRef.current) return;

    const deltaX = Math.abs(e.touches[0].clientX - startPosRef.current.x);
    const deltaY = Math.abs(e.touches[0].clientY - startPosRef.current.y);

    if (deltaX > moveThreshold || deltaY > moveThreshold) {
      clearTimer();
    }
  }, [cancelOnMove, moveThreshold, clearTimer]);

  const handleTouchEnd = useCallback((_e?: React.TouchEvent) => {
    clearTimer();

    // If it wasn't a long press, trigger onPress (if provided) after a small delay
    // to let the click event through
    if (!isLongPressRef.current && onPress) {
      // Don't trigger onPress - let the normal click handler work
    }

    startPosRef.current = null;
  }, [clearTimer, onPress]);

  const handleTouchCancel = useCallback((_e?: React.TouchEvent) => {
    clearTimer();
    startPosRef.current = null;
    isLongPressRef.current = false;
  }, [clearTimer]);

  // For mouse support (optional)
  const handleMouseDown = useCallback(() => {
    isLongPressRef.current = false;

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
    }, threshold);
  }, [onLongPress, threshold]);

  const handleMouseUp = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const handleMouseLeave = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
      onMouseDown: handleMouseDown,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
    },
    isLongPress: isLongPressRef,
  };
}
