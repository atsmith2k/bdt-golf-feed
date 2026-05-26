import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bdt: {
          // Page + panel surfaces (navy)
          bg: '#0B1E40',
          panel: '#13294B',
          panelAlt: '#1A3668',
          border: '#2A467A',
          borderStrong: '#3B5A98',
          // Brand accents
          red: '#D41F2F',
          redDeep: '#A8121F',
          gold: '#E5B335', // optional secondary accent (trophies, medals)
          // Type
          cream: '#F5EFE0',
          white: '#FFFFFF',
          muted: '#8FA3C7',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', '"Bebas Neue"', 'Impact', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        marquee: 'marquee 180s linear infinite',
        marqueeFast: 'marquee 90s linear infinite',
        flash: 'flash 1.2s ease-in-out infinite',
      },
      backgroundImage: {
        'bdt-stadium':
          'radial-gradient(ellipse at top, rgba(60, 100, 170, 0.20) 0%, transparent 55%), linear-gradient(180deg, #0B1E40 0%, #07142A 100%)',
        'bdt-bar':
          'linear-gradient(90deg, #D41F2F 0%, #D41F2F 60%, #A8121F 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
