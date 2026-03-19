import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RankClip — Ranked Video Compilation Maker',
  description:
    'Create ranked video compilations with overlay lists. Upload clips, rank them, export.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
