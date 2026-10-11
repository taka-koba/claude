import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 少し古い iPhone の Safari でも動くように（新しい構文は変換される）
  build: { target: ["es2020", "safari14"] },
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
