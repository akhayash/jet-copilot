const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // Browser scripts — functions are called from HTML onclick attributes
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        WebSocket: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        ResizeObserver: 'readonly',
        URLSearchParams: 'readonly',
        Terminal: 'readonly',
        FitAddon: 'readonly',
        WebLinksAddon: 'readonly',
        requestAnimationFrame: 'readonly',
        globalThis: 'readonly',
        AppUtils: 'readonly',
        lucide: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['node_modules/'],
  },
];
