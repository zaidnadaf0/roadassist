import type { Config } from 'tailwindcss';

/**
 * RoadAssist design tokens. The visual system uses clean pearl-white
 * claymorphism: soft raised surfaces, inset controls, slate text and
 * lavender/indigo actions across every portal.
 */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        grease: {
          DEFAULT: '#F1F4F8',
          soft: '#E8EDF4',
        },
        graphite: {
          DEFAULT: '#F7F9FC',
          soft: '#E9EEF5',
          card: '#FBFCFE',
          hover: '#E1E7F0',
        },
        safety: {
          50: '#F2F4FF',
          100: '#E5E9FF',
          200: '#CBD3FF',
          300: '#AAB7FF',
          400: '#8493F1',
          500: '#6978D9',
          600: '#5968C5',
          700: '#4A57A8',
          800: '#3D488A',
          900: '#30396C',
        },
        // Backward-compatible alias for legacy auth/marketing classes.
        brand: '#6978D9',
        cream: {
          DEFAULT: '#1D293B',
          dim: '#4C5A70',
        },
        steel: {
          300: '#536177',
          400: '#718096',
          500: '#97A3B6',
        },
        line: {
          soft: '#D9E0EA',
          strong: '#C0CAD8',
        },
        success: { DEFAULT: '#3F9B76' },
        warning: { DEFAULT: '#C9874A' },
        danger: { DEFAULT: '#C65F70' },
        // Channel-based surfaces for opacity modifiers (bg-graphite-soft/60).
        surface: {
          1: v('--ra-surface-1'),
          2: v('--ra-surface-2'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '14px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        card: '12px 14px 28px rgb(149 161 181 / 0.28), -9px -9px 22px rgb(255 255 255 / 0.92)',
        clay: '12px 14px 28px rgb(149 161 181 / 0.28), -9px -9px 22px rgb(255 255 255 / 0.92)',
        'clay-sm': '7px 8px 16px rgb(149 161 181 / 0.22), -5px -5px 12px rgb(255 255 255 / 0.90)',
        'clay-inset': 'inset 5px 5px 10px rgb(175 187 204 / 0.28), inset -5px -5px 10px rgb(255 255 255 / 0.90)',
        glow: '0 8px 20px rgb(105 120 217 / 0.22), 0 0 30px rgb(105 120 217 / 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
