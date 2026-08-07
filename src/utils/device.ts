// 设备与浏览器能力探测

export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window ||
      (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0))
  );
}

export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /android|iphone|ipad|ipod|iemobile|blackberry|opera mini/i.test(ua.toLowerCase());
}

export function isLandscape(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= window.innerHeight;
}

// 计算可用的设备像素比，限制性能开销
export function clampedPixelRatio(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.min(2, dpr));
}

export function isIOSChrome(): boolean {
  const ua = (navigator.userAgent || '').toLowerCase();
  return /crios/i.test(ua) && /iphone|ipad|ipod/i.test(ua);
}

// localStorage 安全包装
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 静默忽略
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // 静默忽略
    }
  },
};
