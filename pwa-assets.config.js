import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

const GREEN = "#4c7a39";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: GREEN } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: GREEN } },
  },
  images: ["public/icon.svg"],
});
