/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Escala da marca Rótulo do Bem, ancorada no verde #055E2B (tom 700)
        rdb: {
          50:  '#F7FAF3',
          100: '#EEF2E9',
          200: '#DDE7D4',
          300: '#B9CDAA',
          400: '#7FA86A',
          500: '#4A8443',
          600: '#1B6E36',
          700: '#055E2B',
          800: '#04431F',
          900: '#16241C',
        },
        limao: '#CDDE35',         // destaque sobre o verde escuro
        fundo: '#F4F7EF',         // fundo da aplicação
        tinta: '#16241C',         // texto principal
        'tinta-fraca': '#5C6B60', // texto secundário
        // Semânticas: usar SOMENTE com significado
        ok: '#2E9E4F',
        atencao: '#D97706',
        perigo: '#C0392B',
      },
      fontFamily: {
        titulo: ['var(--fonte-titulo)', 'system-ui', 'sans-serif'],
        corpo: ['var(--fonte-corpo)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        rdb: '0 8px 24px rgba(4,43,20,.06)',
      },
    },
  },
  plugins: [],
}
