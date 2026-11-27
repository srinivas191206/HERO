import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  base: '/gis-3d/',
  plugins: [cesium()],
  server: {
    port: 5173,
    open: false
  }
});
