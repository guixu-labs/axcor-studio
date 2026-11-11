import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { StartupScreen } from './renderer/StartupScreen';
import './renderer/app.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('axcor-studio root element was not found');
}

const renderer = createRoot(root);

if (new URLSearchParams(window.location.search).has('startup')) {
  document.title = 'Axcor Studio';
  document.body.classList.add('startup-window');
  renderer.render(<StartupScreen />);
} else {
  void import('./renderer/App').then(({ default: App }) => {
    function Workbench(): JSX.Element {
      useEffect(() => {
        // Give the hidden window a frame to paint the mounted workbench.
        let frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => window.startup.workbenchLoaded());
        });
        return () => cancelAnimationFrame(frame);
      }, []);
      return <App />;
    }
    renderer.render(<React.StrictMode><Workbench /></React.StrictMode>);
  }).catch(error => {
    window.startup.workbenchLoaded(String(error));
  });
}
