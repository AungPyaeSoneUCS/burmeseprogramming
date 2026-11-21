import type { NextConfig } from "next";

const exporting = process.env.EXPORT_SITE === "1";

const nextConfig: NextConfig = {
  transpilePackages: ["next-mdx-remote"],
  poweredByHeader: false,
  ...(exporting
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;