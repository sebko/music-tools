/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: 'oklch(var(--background) / <alpha-value>)',
          secondary: 'oklch(var(--background-secondary) / <alpha-value>)',
        },
        foreground: {
          DEFAULT: 'oklch(var(--foreground) / <alpha-value>)',
          muted: 'oklch(var(--foreground) / 0.6)',
        },
        main: {
          DEFAULT: 'oklch(var(--main) / <alpha-value>)',
          hover: 'oklch(var(--main-hover) / <alpha-value>)',
          foreground: 'oklch(var(--main-foreground) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'oklch(var(--border) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--main) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
        },
        chart: {
          1: 'oklch(67.47% 0.1726 259.49)',
          2: 'oklch(67.28% 0.2147 24.22)',
          3: 'oklch(86.03% 0.176 92.36)',
          4: 'oklch(79.76% 0.2044 153.08)',
          5: 'oklch(66.34% 0.1806 277.2)',
        }
      },
      borderRadius: {
        'base': '5px',
      },
      boxShadow: {
        'light': '2px 2px 0px 0px rgb(var(--shadow-color))',
        'base': '4px 4px 0px 0px rgb(var(--shadow-color))',
        'heavy': '6px 6px 0px 0px rgb(var(--shadow-color))',
        'light-invert': '-2px -2px 0px 0px rgb(var(--shadow-color))',
        'base-invert': '-4px -4px 0px 0px rgb(var(--shadow-color))',
        'main': '4px 4px 0px 0px oklch(var(--main))',
        'destructive': '4px 4px 0px 0px oklch(var(--destructive))',
      },
      fontFamily: {
        'base': ['PragmataPro', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        'heading': ['PragmataPro', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        'mono': ['PragmataPro', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        'liga': ['PragmataPro Liga', 'PragmataPro', 'ui-monospace', 'monospace'],
      },
      fontWeight: {
        'base': '500',
        'heading': '700',
      },
      animation: {
        'shadow-pop': 'shadowPop 0.2s ease-out',
        'shadow-press': 'shadowPress 0.2s ease-out',
      },
      keyframes: {
        shadowPop: {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(-2px, -2px)' },
        },
        shadowPress: {
          '0%': { transform: 'translate(-2px, -2px)' },
          '100%': { transform: 'translate(0, 0)' },
        },
      },
      transitionProperty: {
        'shadow': 'box-shadow, transform',
      }
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.shadow-press': {
          '@apply transition-shadow duration-200': {},
          '&:active': {
            '@apply shadow-none': {},
            transform: 'translate(2px, 2px)',
          },
        },
        '.border-base': {
          '@apply border-2 border-border': {},
        },
      })
    },
    function({ addComponents }) {
      addComponents({
        '.link-inline': {
          '@apply text-main hover:text-main-hover underline-offset-4 hover:underline transition-colors duration-200': {},
        },
        '.card-brutalist': {
          '@apply rounded-base border-base shadow-base bg-background p-4': {},
        },
        '.input-brutalist': {
          '@apply rounded-base border-base px-3 py-2 bg-background shadow-base transition-all duration-200': {},
          '@apply hover:shadow-heavy hover:-translate-x-0.5 hover:-translate-y-0.5': {},
          '@apply focus:outline-none focus:ring-2 focus:ring-main focus:ring-offset-2 focus:shadow-heavy focus:-translate-x-0.5 focus:-translate-y-0.5': {},
        },
        '.modal-brutalist': {
          '@apply rounded-base border-base shadow-heavy bg-background': {},
        },
      })
    },
  ],
};
