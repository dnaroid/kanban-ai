import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	experimental: {
		// Optimize imports for faster compilation - strips unused exports at build time
		optimizePackageImports: [
			"lucide-react",
			"@radix-ui/react-dialog",
			"@radix-ui/react-dropdown-menu",
			"@radix-ui/react-select",
			"@radix-ui/react-tabs",
			"@radix-ui/react-tooltip",
			"@radix-ui/react-popover",
			"@radix-ui/react-switch",
			"@radix-ui/react-checkbox",
			"@radix-ui/react-avatar",
			"date-fns",
			"framer-motion",
		],
	},
};

export default nextConfig;
