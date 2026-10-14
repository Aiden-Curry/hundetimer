import type { NextConfig } from 'next';
const config: NextConfig = { experimental: { serverActions: { bodySizeLimit: '6mb' } } };
export default config;
