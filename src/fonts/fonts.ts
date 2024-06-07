import localFont from 'next/font/local'

export const brockmann = localFont({
  src: [
    {
      path: './brockmann/brockmann-regular-webfont.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './brockmann/brockmann-regularitalic-webfont.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: './brockmann/brockmann-medium-webfont.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: './brockmann/brockmann-mediumitalic-webfont.woff2',
      weight: '500',
      style: 'italic',
    },
    {
      path: './brockmann/brockmann-semibold-webfont.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './brockmann/brockmann-semibolditalic-webfont.woff2',
      weight: '600',
      style: 'italic',
    },
    {
      path: './brockmann/brockmann-bold-webfont.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: './brockmann/brockmann-bolditalic-webfont.woff2',
      weight: '700',
      style: 'italic',
    },
  ],
});
