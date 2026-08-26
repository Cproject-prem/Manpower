import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from frontend/.env so existing REACT_APP_BACKEND_URL keeps working
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react({
        // Allow JSX inside `.js` files (existing codebase uses .js for components)
        include: /\.(jsx?|tsx?)$/,
      }),
      {
        name: "html-env-transform",
        transformIndexHtml(html) {
          return html.replace(/%REACT_APP_BACKEND_URL%/g, env.REACT_APP_BACKEND_URL || "");
        },
      },
    ],
    esbuild: {
      loader: "jsx",
      include: /src\/.*\.(jsx?|tsx?)$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: { ".js": "jsx" },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    // Expose existing REACT_APP_* vars to client code via process.env (CRA-compatible)
    define: {
      "process.env.REACT_APP_BACKEND_URL": JSON.stringify(env.REACT_APP_BACKEND_URL),
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    envPrefix: ["VITE_", "REACT_APP_"],
    server: {
      host: "0.0.0.0",
      port: 3001,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: "http://localhost:8002",
          changeOrigin: true,
          secure: false,
        },
        "/uploads": {
          target: "http://localhost:8002",
          changeOrigin: true,
          secure: false,
        },
      },
      // When running behind an HTTPS reverse proxy (preview environment),
      // set VITE_HMR_HOST + VITE_HMR_PORT in .env to route HMR over wss.
      // For plain `localhost` development we leave HMR on defaults.
      hmr: env.VITE_HMR_HOST
        ? {
            host: env.VITE_HMR_HOST,
            clientPort: Number(env.VITE_HMR_PORT || 443),
            protocol: env.VITE_HMR_PROTOCOL || "wss",
          }
        : true,
    },
    preview: {
      host: "0.0.0.0",
      port: 3001,
      allowedHosts: true,
    },
    build: {
      outDir: "build",
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  };
});
