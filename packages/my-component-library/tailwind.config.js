import neobrutalistPreset from './src/tailwind/preset.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [neobrutalistPreset],
  content: [
    "./src/**/*.{js,jsx}",
    "./.storybook/**/*.{js,jsx}",
  ],
};
