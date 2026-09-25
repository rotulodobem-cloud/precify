/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mesma escala de marca do Precify (verde Rótulo do Bem #055E2B = 700)
        rdb: {
          50: '#F7FAF3', 100: '#EEF2E9', 200: '#DDE7D4', 300: '#B9CDAA', 400: '#7FA86A',
          500: '#4A8443', 600: '#1B6E36', 700: '#055E2B', 800: '#04431F', 900: '#0E2418',
        },
        fundo: '#F5F7F4',
        tinta: '#16241C',
        'tinta-fraca': '#5C6B60',
        linha: '#E4E9E2',
        // Séries de gráfico — paleta validada (scripts/validate_palette.js da skill de dataviz):
        // azul / laranja / água, CVD ΔE ≥ 9. Nunca reutilizar como cor de estado.
        serie: { 1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a' },
      },
      boxShadow: { card: '0 1px 2px rgba(16,36,24,.04), 0 4px 16px rgba(16,36,24,.05)' },
    },
  },
  plugins: [],
}
