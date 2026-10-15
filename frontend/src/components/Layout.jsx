import { Outlet } from 'react-router-dom';
import AppShell from './ui/AppShell';

export default function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
