import React from 'react';
import ReactDOM from 'react-dom/client';
import CardsApp from './CardsApp';
import '../design-tokens.css';
import '../accessibility.css';
import './cards.css';
import './rest.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><CardsApp/></React.StrictMode>);
