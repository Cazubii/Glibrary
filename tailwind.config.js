/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'steam-bg': 'hsl(var(--steam-bg) / <alpha-value>)',
        'steam-panel': 'hsl(var(--steam-panel) / <alpha-value>)',
        'steam-elevated': 'hsl(var(--steam-elevated) / <alpha-value>)',
        'steam-text': 'hsl(var(--steam-text) / <alpha-value>)',
        'steam-accent': 'hsl(var(--steam-accent) / <alpha-value>)',
        'steam-green': 'hsl(var(--steam-green) / <alpha-value>)',
        'steam-error': 'hsl(var(--steam-error) / <alpha-value>)',
        'steam-warn': 'hsl(var(--steam-warn) / <alpha-value>)'
      }
    }
  },
  plugins: []
}
