import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      animation: {
        'fadeIn': 'fadeIn 0.6s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.6s ease-out forwards',
        'spin-slow': 'spin 8s linear infinite',
        'spin-medium': 'spin 5s linear infinite',
        'spin-reverse': 'spin-reverse 6s linear infinite',
        'spin-reverse-slow': 'spin-reverse 10s linear infinite',
        'pulse-strong': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient-x': 'gradient-x 5s ease infinite',
        'float-up': 'float-up 15s linear infinite',
        'float-up-slow': 'float-up 25s linear infinite',
        'float-up-fast': 'float-up 8s linear infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'spin-reverse': {
          'from': { transform: 'rotate(360deg)' },
          'to': { transform: 'rotate(0deg)' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'float-up': {
          '0%': { transform: 'translateY(100vh)' },
          '100%': { transform: 'translateY(-50vh)' }
        }
      },
      boxShadow: {
        'glow-amber': '0 0 15px rgba(245, 158, 11, 0.5)',
        'glow-orange': '0 0 15px rgba(234, 88, 12, 0.5)',
        'glow-yellow': '0 0 15px rgba(252, 211, 77, 0.5)',
      },
    },
    screens: {
      'xs': '390px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
  },
  plugins: [],
} satisfies Config;