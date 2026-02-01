/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Palantir-inspired dark theme
        sda: {
          bg: {
            primary: '#0d1117',
            secondary: '#161b22',
            tertiary: '#21262d',
            elevated: '#30363d',
          },
          border: {
            default: '#30363d',
            muted: '#21262d',
          },
          text: {
            primary: '#e6edf3',
            secondary: '#8b949e',
            muted: '#6e7681',
          },
          accent: {
            blue: '#2f81f7',
            cyan: '#39c5cf',
            green: '#3fb950',
            yellow: '#d29922',
            orange: '#db6d28',
            red: '#f85149',
            purple: '#a371f7',
          },
        },
      },
      fontFamily: {
        sans: ['var(--font-ibm-plex-sans)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};

