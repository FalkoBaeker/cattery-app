import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TabBar } from './TabBar';

/**
 * Grundgerüst: Inhalt oben, Tab-Leiste unten.
 * Beim Seitenwechsel wird nach oben gescrollt — sonst landet man
 * mitten in einer neuen Seite.
 */
export function AppLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-full">
      <Outlet />
      <TabBar />
    </div>
  );
}
