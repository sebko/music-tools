import { useEffect, useRef } from "react";

export function useHueRotation() {
  const currentHueRef = useRef(259.61); // Starting hue value

  useEffect(() => {
    const interval = setInterval(() => {
      // Smooth increment: 0.5 degrees every 50ms = 36 second full cycle
      currentHueRef.current += 0.5;

      // Reset to starting position when reaching full rotation
      if (currentHueRef.current >= 619.61) { // 259.61 + 360
        currentHueRef.current = 259.61;
      }

      // Update the CSS variables for both light and dark modes
      const root = document.documentElement;

      // Format: L% C H (OKLCH values)
      const lightMain = `67.47% 0.9 ${currentHueRef.current}`;
      const darkMain = `67.47% 0.9 ${currentHueRef.current}`;
      const lightMainHover = `60% 0.15 ${currentHueRef.current}`;
      const darkMainHover = `75% 0.18 ${currentHueRef.current}`;

      // Update CSS variables
      root.style.setProperty("--main", lightMain);
      root.style.setProperty("--main-hover", lightMainHover);

      // Apply dark theme values if dark mode is active
      if (root.classList.contains("dark")) {
        root.style.setProperty("--main", darkMain);
        root.style.setProperty("--main-hover", darkMainHover);
      }
    }, 50); // Update every 50ms for smooth animation (20fps)

    // Cleanup on unmount
    return () => clearInterval(interval);
  }, []);
}
