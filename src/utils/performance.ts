/**
 * Performance monitoring utilities
 */

export const initializePerformanceMonitoring = () => {
  if (typeof window !== "undefined") {
    // Add performance entry
    const markInitialLoad = () => {
      if (window.performance && window.performance.mark) {
        window.performance.mark("appInit_start");
        
        // Record endpoint timing
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          const url = args[0].toString();
          const start = performance.now();
          const fetchPromise = originalFetch.apply(this, args);
          
          fetchPromise.then(() => {
            const end = performance.now();
            console.log(`[Performance] Fetch to ${url} took ${end - start}ms`);
          });
          
          return fetchPromise;
        };
        
        window.addEventListener("load", () => {
          window.performance.mark("appInit_end");
          window.performance.measure("appInitialization", "appInit_start", "appInit_end");
          
          const measure = window.performance.getEntriesByName("appInitialization")[0];
          console.log(`[Performance] App initialization took ${measure.duration}ms`);
        });
      }
    };
    
    markInitialLoad();
  }
};

export const startApiCall = (name: string) => {
  if (typeof window !== "undefined" && window.performance) {
    window.performance.mark(`api_${name}_start`);
  }
};

export const endApiCall = (name: string) => {
  if (typeof window !== "undefined" && window.performance) {
    window.performance.mark(`api_${name}_end`);
    window.performance.measure(`api_${name}`, `api_${name}_start`, `api_${name}_end`);
    
    const measure = window.performance.getEntriesByName(`api_${name}`)[0];
    console.log(`[Performance] API call ${name} took ${measure.duration}ms`);
  }
};