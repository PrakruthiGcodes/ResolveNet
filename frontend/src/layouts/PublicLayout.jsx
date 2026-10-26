import { Outlet } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';

export function PublicLayout() {
  return (
    <>
      <a href="#rn-main-content" className="rn-skip-link">
        Skip to main content
      </a>
      <Header />
      <main id="rn-main-content" style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
