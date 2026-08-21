import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { BrowserFavicon } from './components/BrowserFavicon';
import './index.css';
import './pages/PhysicalAssessment/capacity-prescription-responsive.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserFavicon />
    <App />
  </React.StrictMode>
);
