import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#1c1917', borderRadius: 8 } }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </StrictMode>,
);
