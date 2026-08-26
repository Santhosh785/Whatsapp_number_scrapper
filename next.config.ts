import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the tracing root to this project. Without it Next.js walks up and finds
  // an unrelated lockfile in the parent directory, which skews what gets
  // bundled into the serverless functions.
  outputFileTracingRoot: path.join(__dirname),

  // whatsapp-web.js, puppeteer-core and @sparticuz/chromium must stay external:
  // they load native/binary assets at runtime that the bundler cannot inline.
  serverExternalPackages: [
    'whatsapp-web.js',
    'puppeteer-core',
    '@sparticuz/chromium',
    'wwebjs-mongo',
    'mongoose',
  ],
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/whatsapp-web.js/**'],
  },
};

export default nextConfig;
