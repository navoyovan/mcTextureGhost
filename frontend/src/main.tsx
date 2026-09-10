// frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root DOM element "#root" not found in document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
