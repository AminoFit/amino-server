/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors: {
        amino: {
          50: '#F4FCE8',
          100: '#E9F9D2',
          200: '#D2F4A4',
          300: '#BCEE77',
          400: '#A5E84A',
          500: '#8FE31C',
          600: '#72B517',
          700: '#568811',
          800: '#395B0B',
          900: '#1D2D06',
        },
      }
    },
  },
  plugins: [
    // ...
    require('@tailwindcss/forms'),
  ],
}
