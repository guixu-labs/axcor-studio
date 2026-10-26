import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './renderer/App';
import './renderer/app.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Agent Workbench root element was not found');
}

try {
  createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
} catch (error) {
  root.innerHTML = `<div class="boot-error"><strong>Agent Workbench failed to start</strong><pre>${String(error)}</pre></div>`;
}
