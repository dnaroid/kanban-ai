import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@kanban-ai/shared"],
	experimental: {
		optimizePackageImports: ["lucide-react"],
	},
};

export default nextConfig;
