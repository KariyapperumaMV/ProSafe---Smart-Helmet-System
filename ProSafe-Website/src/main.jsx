import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/index.css';
import App from './App.jsx';

// Enable scroll-reveal animations only when they can work and are wanted.
const canAnimate =
  'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (canAnimate) document.documentElement.classList.add('reveal-ready');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
