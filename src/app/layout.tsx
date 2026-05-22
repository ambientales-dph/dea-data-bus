
import type {Metadata, Viewport} from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { TrelloSyncManager } from '@/components/trello-sync-manager';
import { SessionTimeoutManager } from '@/components/session-timeout-manager';
import { ServiceWorkerRegistration } from '@/components/sw-registration';

export const metadata: Metadata = {
  title: 'DEA Data Bus',
  description: 'Remote environmental data collection and monitoring platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DEA Data Bus',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#327787',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Encode+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="application-name" content="DEA Data Bus" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DEA Bus" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-body antialiased selection:bg-accent/30">
        <FirebaseClientProvider>
          <ServiceWorkerRegistration />
          <TrelloSyncManager />
          <SessionTimeoutManager />
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
