import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Plateforme SaaS', template: '%s · Plateforme SaaS' },
  description: 'Console multi-tenant : organisations, membres, modules, quotas et audit.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Applique le mode sombre avant le premier rendu pour éviter un flash (le thème fin est géré par TenantThemeProvider).
const themeBootstrap = `try{var m=localStorage.getItem('saas.themeMode');var d=m==='DARK'||((!m||m==='SYSTEM')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
