import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    base: '/app/',
    server: {
        port: 5173,
        host: true,
        proxy: {
            '/api': 'http://localhost:3001',
            '/webhooks': 'http://localhost:3001',
        },
    },
    build: {
        target: 'es2020',
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom', 'react-router-dom'],
                    charts: ['recharts'],
                },
            },
        },
    },
});
