import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// This is a setup file for Vitest. It runs before each test file.

// It ensures that after each test, the DOM is cleaned up automatically.
afterEach(() => {
  cleanup();
});
