import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        solana: {
          50: '#f5f4ff',
          100: '#ede9fe',
          500: '#7c3aed',
          600: '#5b21b6'
        },
        cash: {
          500: '#00d4aa',
          600: '#00a983'
        }
      }
    }
  },
  plugins: []
};

export default config;

