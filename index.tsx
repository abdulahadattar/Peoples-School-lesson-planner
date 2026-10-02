import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* reducedMotion="user" makes framer-motion honour the OS-level
        "remove animations" setting. The prefers-reduced-motion block in
        index.css cannot reach JS-driven animations, so without this every
        user who asked for reduced motion still got the full effect. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>
);
