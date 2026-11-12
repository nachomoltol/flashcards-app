import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['pdf-lib'],
  async redirects() {
    return [
      {
        // Redirigir de apex (flashmente.com) a www EXCEPTO /.well-known/assetlinks.json
        // para que Google Play Console reciba HTTP 200 directo sin redirección (301/308).
        source: '/:path((?!\\.well-known/assetlinks\\.json$).*)',
        has: [
          {
            type: 'host',
            value: 'flashmente.com',
          },
        ],
        destination: 'https://www.flashmente.com/:path',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/privacy',
        destination: '/privacidad',
      },
      {
        source: '/auth/confirm',
        destination: '/auth/callback',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(privacidad|privacy)',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'all, index, follow',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, HEAD, OPTIONS',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate',
          },
        ],
      },
      {
        source: '/robots.txt',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/plain; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
