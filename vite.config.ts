import { defineConfig } from "vite";

// GitHub Pages (project site) でもローカルでも動くよう相対パスでビルドする
export default defineConfig({
  base: "./",
});
