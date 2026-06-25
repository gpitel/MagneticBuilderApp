import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { defineConfig } from 'vite'
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import viteCompression from 'vite-plugin-compression';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Determine the correct path for WebSharedComponents
// When standalone (own .git directory): use ./WebSharedComponents
// When used as submodule (.git is a file pointing to parent): use ../WebSharedComponents
function getWebSharedComponentsPath() {
    const parentPath = path.resolve(__dirname, "../WebSharedComponents");
    const localPath = path.resolve(__dirname, "./WebSharedComponents");
    const gitPath = path.resolve(__dirname, ".git");
    
    // If .git is a file, this is a submodule -> use parent WebSharedComponents
    // If .git is a directory, this is standalone -> use local WebSharedComponents
    const isSubmodule = fs.existsSync(gitPath) && fs.statSync(gitPath).isFile();
    
    if (isSubmodule && fs.existsSync(parentPath)) {
        return parentPath;
    }
    return localPath;
}

// Resolved at config-load time (top-level await is fine for Vite ESM config).
const masRegen = (await import(
    pathToFileURL(path.join(getWebSharedComponentsPath(), 'build-tools', 'vite-plugin-mas-regen.js')).href
)).default;


// https://vitejs.dev/config/
export default defineConfig({
    // Include WASM-related files as assets so they're copied to the build output
    assetsInclude: ['**/*.wasm'],
    build: {
        rollupOptions: {
            output: {
                chunkFileNames: 'assets/js/[name]-[hash].js',
                entryFileNames: 'assets/js/[name]-[hash].js',
                
                assetFileNames: ({name}) => {
                    if (/\.(gif|jpe?g|png|svg)$/.test(name ?? '')){
                        return 'assets/images/[name]-[hash][extname]';
                    }
                    
                    if (/\.css$/.test(name ?? '')) {
                        return 'assets/css/[name]-[hash][extname]';
                    }
                    
                    // Keep WASM files in assets/wasm without hash for predictable paths
                    if (/\.wasm$/.test(name ?? '')) {
                        return 'assets/wasm/[name][extname]';
                    }
 
                    // default value
                    // ref: https://rollupjs.org/guide/en/#outputassetfilenames
                    return 'assets/[name]-[hash][extname]';
                },
            },
        },
    },
    optimizeDeps: {
        disabled: false,
    },
    worker: {
        format: 'es',
    },
    publicDir: 'src/public',
    plugins: [
        // Auto-regen MAS.ts when MAS schemas change. See WebSharedComponents/build-tools.
        masRegen({
            targets: [
                fileURLToPath(new URL('./src/assets/ts/MAS.ts', import.meta.url)),
                path.join(getWebSharedComponentsPath(), 'assets', 'ts', 'MAS.ts'),
            ],
        }),
        vue({
          template: {
            compilerOptions: {
              isCustomElement: (tag) => tag.includes("py-"),
              whitespace: "preserve",
            },
          },
        }),
        vueJsx(),
        viteCompression({filter: '/\.(js|mjs|json|css|html|wasm)$/i'}),
        // Copy WASM files from assets to wasm/ folder in build output
        viteStaticCopy({
            targets: [
                {
                    src: 'src/assets/js/libMKF.wasm.js',
                    dest: 'wasm'
                },
                {
                    src: 'src/assets/js/libMKF.wasm.wasm',
                    dest: 'wasm'
                },
                {
                    src: 'src/assets/js/mvbpp.js',
                    dest: 'wasm'
                },
                {
                    src: 'src/assets/js/mvbpp.wasm',
                    dest: 'wasm'
                }
            ]
        }),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            "/WebSharedComponents": getWebSharedComponentsPath(),
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'https://localhost:8888',
                changeOrigin: true,
                secure: false,      
                ws: true,
            }
        
        }
    }
})
