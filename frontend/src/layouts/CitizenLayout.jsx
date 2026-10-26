import { Outlet } from 'react-router-dom';
import { Header } from '../components/layout/Header';

export function CitizenLayout() {
  return (
    <>
      <a href="#rn-main-content" className="rn-skip-link">
        Skip to main content
      </a>
      <Header />
      <main id="rn-main-content" style={{ flex: 1, background: 'var(--rn-color-bg)' }}>
        <Outlet />
      </main>
    </>
  );
}
