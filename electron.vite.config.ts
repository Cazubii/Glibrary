import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GLIBRARY_')
  const githubClientId = env['GLIBRARY_GITHUB_OAUTH_CLIENT_ID'] ?? ''

  return {
    main: {
      define: {
        __GLIBRARY_GITHUB_OAUTH_CLIENT_ID__: JSON.stringify(githubClientId)
      },
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        },
        dedupe: ['react', 'react-dom']
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client', 'zustand', 'lucide-react']
      },
      plugins: [react()]
    }
  }
})
