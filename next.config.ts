import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongodb", "unpdf", "mammoth", "playwright"],
};

export default nextConfig;
