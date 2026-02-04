const config = {
  appId: "com.kanbanai.app",
  productName: "Kanban AI",
  directories: {
    output: "dist",
  },
  files: ["dist/**/*", "dist-electron/**/*", "package.json"],
  mac: {
    category: "____public.app-category.productivity",
    icon: "build/icons/icon.icns",
  },
  win: {
    target: ["nsis"],
    icon: "build/icons/favicon.ico",
  },
  linux: {
    target: ["AppImage"],
    icon: "build/icons/icon-512.png",
  },
}

export default config
