'use client';

import Sidebar from '@/components/Sidebar';
import { DataProvider } from '@/lib/DataContext';

export default function AppShell({ children }) {
  return (
    <DataProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content" id="main-content">
          {children}
          <div className="app-footer">Built with Google AI Studio &amp; Antigravity · AI Seekho 2026</div>
        </main>
      </div>
    </DataProvider>
  );
}
