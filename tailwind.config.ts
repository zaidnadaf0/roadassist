import type { Config } from 'tailwindcss';

/**
 * RoadAssist design tokens — "Midnight Navy + Warm Amber".
 *
 * The token NAMES are the public contract every page already uses (cream =
 * primary text, graphite = surfaces, grease = page ground, safety = accent,
 * steel = secondary text, line = borders). Only the VALUES are re-pointed, so
 * one theme change reaches every portal without per-page duplication.
 *
 * Palette (locked):
 *   page   #17251D   card   #1A202B   elevated #263236
 *   accent #D993EA   hover  #E8A267   text     #212B36
 *   muted  #8899A3   border #4A4A5A
 *
 * Semantic colour families (success / warning / danger) stay distinct from the
 * purple accent so status is never conveyed by colour alone — every use also
 * carries a label or an icon.
 */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Inputs, code blocks, inset wells. */
        grease: {
          DEFAULT: '#17253D',
          soft: '#1A202E',
        },
        /** Surfaces: cards, hover states, scaffold panels. */
        graphite: {
          DEFAULT: '#1A202E',
          soft: '#263236',
          card: '#1A202B',
          hover: '#293E5E',
        },
        /** Primary accent — Warm Amber. */
        safety: {
          50: '#FFF9E5',
          100: '#F2F0E0',
          200: '#D5C4C0',
          300: '#C298A8',
          400: '#D99532',
          500: '#D99532',
          600: '#B8860B',
          700: '#97730A',
          800: '#866708',
          900: '#5C4A08',
        },
        /** Backward-compatible alias for legacy auth/marketing classes. */
        brand: '#D99532',
        /** Primary + secondary type. */
        cream: {
          DEFAULT: '#F4F1EA',
          dim: '#A1A1AA',
        },
        steel: {
          300: '#C0C2D0',
          400: '#A1A1AA',
          500: '#8A8A95',
        },
        line: {
          soft: '#4A5568',
          strong: '#4A5568',
        },
        success: { DEFAULT: '#38A752' },
        warning: { DEFAULT: '#F5A524' },
        danger: {
          DEFAULT: '#F87171',
          /** Filled red surfaces that carry white text (pills, solid buttons). */
          solid: '#DC2626',
        },
        /** Channel-based surfaces for opacity modifiers (bg-graphite-soft/60). */
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
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '12px',
      },
      boxShadow: {
        /** Dark elevation: a hairline lift plus a deep ambient shadow. */
        card: '0 1px 2px rgb(0 0 0 / 0.35), 0 12px 32px -8px rgb(0 0 0 / 0.9)',
        clay: '0 1px 2px rgb(0 0 0 / 0.35), 0 12px 32px -8px rgb(0 0 0 / 0.9)',
        'clay-sm': '0 1px 2px rgb(0 0 0 / 0.3), 0 8px 20px -4px rgb(0 0 0 / 0.85)',
        'clay-inset': 'inset 0 1px 2px rgb(0 0 0 / 0.45)',
        /** Warm amber accent for primary actions only. */
        glow: '0 8px 20px -8px rgb(217 149 0 / 0.55), 0 0 0 1px rgb(217 149 0 / 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;