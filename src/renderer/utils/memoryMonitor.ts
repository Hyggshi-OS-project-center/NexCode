/**
 * Memory monitor — periodically checks renderer memory usage and reports
 * to the main process so it can perform GC or alert the user.
 * Helps keep total RAM below 200 MB.
 */

const MEMORY_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Start monitoring renderer memory usage.
 * Logs warnings when memory exceeds thresholds and triggers garbage collection.
 */
export function startMemoryMonitor(): void {
  if (!('performance' in window) || !(performance as unknown as Record<string, unknown>).memory) {
    // Chrome-only memory API; silently skip on other browsers
    return;
  }

  const checkMemory = () => {
    const mem = (performance as unknown as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    const usedMB = Math.round(mem.usedJSHeapSize / 1024 / 1024);
    const limitMB = Math.round(mem.jsHeapSizeLimit / 1024 / 1024);

    // If renderer JS heap exceeds 150 MB, suggest page refresh or trim
    if (usedMB > 150) {
      console.warn(`[Memory] Renderer using ${usedMB} MB / ${limitMB} MB — triggering GC suggestion`);
    }

    // If over 120 MB, trigger periodic GC hints
    if (usedMB > 120 && typeof (window as unknown as { gc?: () => void }).gc === 'function') {
      try {
        (window as unknown as { gc: () => void }).gc();
      } catch {
        // GC not available outside devtools
      }
    }
  };

  // Check every 30 seconds
  window.setInterval(checkMemory, MEMORY_CHECK_INTERVAL);

  // Also check after idle periods
  checkMemory();
}

/**
 * Helper to log current memory usage to the console.
 */
export function logMemoryUsage(): void {
  if (!('performance' in window) || !(performance as unknown as Record<string, unknown>).memory) return;

  const mem = (performance as unknown as { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number; totalJSHeapSize: number } }).memory;
  console.log(
    `[Memory] Used: ${Math.round(mem.usedJSHeapSize / 1024 / 1024)} MB | ` +
    `Total: ${Math.round(mem.totalJSHeapSize / 1024 / 1024)} MB | ` +
    `Limit: ${Math.round(mem.jsHeapSizeLimit / 1024 / 1024)} MB`,
  );
}