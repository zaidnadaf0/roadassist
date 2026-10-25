import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('RoadAssist: #root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
