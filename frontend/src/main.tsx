import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import './design-system.css';
import './part2.css';

const params = new URLSearchParams(location.search);
const Root = import.meta.env.DEV && params.get('sixMonthDemo') === '1' ? React.lazy(() => import('./SixMonthDemo'))
  : import.meta.env.DEV && params.get('monthlyFixture') === '1' ? React.lazy(() => import('./DevMonthly')) : App;

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><React.Suspense fallback={<p>화면을 불러오고 있습니다.</p>}><Root /></React.Suspense></React.StrictMode>);
