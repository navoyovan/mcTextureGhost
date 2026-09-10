/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

interface WebViewMessageEvent extends MessageEvent {
  data: any;
}

interface WebView {
  postMessage: (message: any) => void;
  addEventListener: (type: 'message', listener: (event: WebViewMessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: WebViewMessageEvent) => void) => void;
}

interface ChromeWebViewBridge {
  webview?: WebView;
}

interface Window {
  chrome?: ChromeWebViewBridge;
}
