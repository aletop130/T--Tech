/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sda: {
          bg: {
            primary: '#050505',
            secondary: '#0a0a0a',
            tertiary: '#141414',
            elevated: '#1f1f1f',
            sidebar: '#0f0f0f',
          },
          border: {
            default: '#2a2a2a',
            muted: '#1a1a1a',
          },
          text: {
            primary: '#f0f0f0',
            secondary: '#a0a0a0',
            muted: '#606060',
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
        sans: ['"Google Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Google Sans Code"', 'monospace'],
        code: ['"Google Sans Code"', 'monospace'],
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};
