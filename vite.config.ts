import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Приложение использует HashRouter, поэтому относительный base './' работает
// на любом статическом хостинге, в том числе в подпапке GitHub Pages.
// При необходимости base задаётся переменной BASE_PATH, например BASE_PATH=/2b-crm/.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
});
