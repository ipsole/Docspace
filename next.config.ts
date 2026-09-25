import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['firebase-admin', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  allowedDevOrigins: ['docspace.docdril.com', 'test.docdril.com', 'localhost', '127.0.0.1', '192.168.0.101']
};

export default nextConfig;
