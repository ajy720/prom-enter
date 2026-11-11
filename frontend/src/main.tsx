import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PartThree from './PartThree';
import './style.css';
import './design-system.css';
import './part2.css';
import './part4.css';
import './portraits.css';

const params = new URLSearchParams(location.search);
const Root = params.get('part4Demo') === '1' ? React.lazy(() => import('./PartFour'))
  : params.get('part3Demo') === '1' ? PartThree
  : import.meta.env.DEV && params.get('sixMonthDemo') === '1' ? React.lazy(() => import('./SixMonthDemo'))
  : import.meta.env.DEV && params.get('monthlyFixture') === '1' ? React.lazy(() => import('./DevMonthly')) : App;

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><React.Suspense fallback={<p>화면을 불러오고 있습니다.</p>}><Root /></React.Suspense></React.StrictMode>);
