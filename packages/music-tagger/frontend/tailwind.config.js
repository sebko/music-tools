import neobrutalistPreset from '@dj-tools/my-component-library/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [neobrutalistPreset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../node_modules/@dj-tools/my-component-library/dist/**/*.js",
  ],
};
