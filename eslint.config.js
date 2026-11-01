import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{js,mjs,jsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/dev-dist/**'],
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // shadcn-vue CLI 生成的组件：保持与上游一致，方便 `shadcn-vue diff` 增量升级。
    // 它们的 prop 声明风格（全部 required:false 且无 default）会触发这两条规则。
    name: 'app/shadcn-ui',
    files: ['src/components/ui/**/*.vue'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/html-self-closing': 'off',
    },
  },
  {
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        XMLHttpRequest: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        // Vite globals
        import: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        // Service Worker globals
        self: 'readonly',
        caches: 'readonly',
        // Web API
        Notification: 'readonly',
        ServiceWorker: 'readonly',
        PushManager: 'readonly',
        PushSubscription: 'readonly',
        // Web Storage API
        Storage: 'readonly',
        StorageEvent: 'readonly',
        // Web Socket
        WebSocket: 'readonly',
        // Web Workers
        Worker: 'readonly',
        SharedWorker: 'readonly',
        // Fetch API
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        globalThis: 'readonly',
        // Animation / timing
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        // DOM
        location: 'readonly',
      },
    },
  }
]
