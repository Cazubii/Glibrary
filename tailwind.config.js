/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'steam-bg': '#171a21',
        'steam-panel': '#1b2838',
        'steam-elevated': '#2a475e',
        'steam-text': '#c7d5e0',
        'steam-accent': '#66c0f4',
        'steam-green': '#5ba32b',
        'steam-error': '#c94a4a',
        'steam-warn': '#d8a031'
      }
    }
  },
  plugins: []
}
