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
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        background: '#0A0D12',
        foreground: '#F0F2F5',
        card: { DEFAULT: '#111620', foreground: '#F0F2F5' },
        popover: { DEFAULT: '#1A2030', foreground: '#F0F2F5' },
        primary: { DEFAULT: '#3B82F6', foreground: '#F0F2F5' },
        secondary: { DEFAULT: '#1A2030', foreground: '#8A95A8' },
        muted: { DEFAULT: '#1A2030', foreground: '#8A95A8' },
        accent: { DEFAULT: '#222D40', foreground: '#F0F2F5' },
        destructive: { DEFAULT: '#EF4444', foreground: '#F0F2F5' },
        border: '#222D40',
        input: '#222D40',
        ring: '#3B82F6',
        // Meridian semantic
        yield: { DEFAULT: '#10B981', hover: '#059669', bg: '#052e16' },
        ai: { DEFAULT: '#7C3AED', hover: '#8B5CF6', bg: '#1e1030' },
        surface: { DEFAULT: '#111620', '2': '#1A2030' },
        // Strategy allocation colors
        strategy: {
          cmeth: '#3B82F6',
          aave: '#10B981',
          usdy: '#F59E0B',
          idle: '#374151',
        },
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulse: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
