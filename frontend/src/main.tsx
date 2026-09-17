// frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/global.css';

// Ensure WebGL pixelStore unpack parameters don't leak into 3D texture initialization
if (typeof window !== 'undefined' && window.WebGL2RenderingContext) {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextType: string, ...args: any[]) {
    const ctx = originalGetContext.call(this, contextType, ...args);
    if (ctx && (contextType === 'webgl2' || contextType === 'webgl')) {
      const gl = ctx as WebGL2RenderingContext;
      if (typeof gl.pixelStorei === 'function') {
        try {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        } catch { }
      }
    }
    return ctx;
  } as any;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root DOM element "#root" not found in document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
