import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Horus - Space Domain Awareness',
  description: 'Horus - Space Domain Awareness Platform for protecting space assets',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="font-sans bp6-dark bg-sda-bg-primary">
        {children}
      </body>
    </html>
  );
}

