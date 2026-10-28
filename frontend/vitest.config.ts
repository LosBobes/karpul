import { defineConfig } from 'vitest/config'

// Unit tests (`npm test`): the code under src/lib, and the one component that
// works the DOM by hand (SlideSwitch). jsdom, because the stores read
// localStorage and the formatters read the browser's Intl. The browser
// end to end is e2e/ with Playwright (`npm run e2e`), not this.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
