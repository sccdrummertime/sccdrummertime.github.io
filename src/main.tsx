import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// visible at boot in remote/desktop debugging to confirm the running build
console.info(`Open Metronome build ${__BUILD_ID__}`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
