import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // ── Fonts ────────────────────────────────────────────────────────────
      // Inter and JetBrains Mono loaded via next/font/google in layout.tsx
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },

      // ── Colors ───────────────────────────────────────────────────────────
      colors: {
        // shadcn-compatible aliases so existing shadcn components stay intact
        background:  '#0A0E14',
        foreground:  '#F5F7FA',
        card:        { DEFAULT: '#12161F', foreground: '#F5F7FA' },
        popover:     { DEFAULT: '#1A1F2B', foreground: '#F5F7FA' },
        primary:     { DEFAULT: '#3B82F6', foreground: '#ffffff' },
        secondary:   { DEFAULT: '#12161F', foreground: '#9CA3AF' },
        surface:     '#12161F',
        muted:       { DEFAULT: '#1A1F2B', foreground: '#9CA3AF' },
        accent:      { DEFAULT: '#93C5FD', foreground: '#0A0E14' },
        destructive: { DEFAULT: '#F87171', foreground: '#ffffff' },
        border:      'rgba(255,255,255,0.08)',
        input:       '#1A1F2B',
        ring:        '#3B82F6',

        // Explicit requested tokens
        'text-primary': '#F5F7FA',
        'text-secondary': '#9CA3AF',

        // ── Meridian design-system tokens (DESIGN.md "Color tokens") ──────
        meridian: {
          // Surfaces
          bg:               '#0A0E14',
          surface:          '#12161F',
          'surface-raised': '#1A1F2B',

          // Borders
          border:           'rgba(255,255,255,0.08)',
          'border-hover':   'rgba(255,255,255,0.16)',

          // Text
          'text-primary':   '#F5F7FA',
          'text-secondary': '#9CA3AF',
          'text-tertiary':  '#6B7280',

          // Brand blue — primary actions, links, active states
          blue:        '#3B82F6',
          'blue-dim':  '#1E3A6E',
          'blue-light':'#93C5FD',

          // Semantic
          success: '#34D399',
          warning: '#FBBF24',
          danger:  '#F87171',
        },

        // Strategy allocation colors (allocation bar ONLY — all blue family)
        strategy: {
          cmeth: '#3B82F6',   // meridian-blue
          aave:  '#185FA5',   // darker blue
          usdy:  '#93C5FD',   // blue-light
          idle:  '#374151',
        },
      },

      // ── Border radius (DESIGN.md "Spacing & layout") ─────────────────────
      // 16px cards · 8px buttons/inputs · 9999px pills/badges
      borderRadius: {
        card:    '16px',
        control: '8px',
        pill:    '9999px',
        lg:      '16px',
        md:      '8px',
        DEFAULT: '8px',
        sm:      '4px',
        full:    '9999px',
      },

      // ── Max content width ────────────────────────────────────────────────
      maxWidth: {
        content: '1080px',
      },

      // ── Animations ───────────────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-opacity': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.3s ease-out',
        'pulse-opacity': 'pulse-opacity 2s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
}

export default config
