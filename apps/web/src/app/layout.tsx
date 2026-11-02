import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Andemta — Better Research. Better Decisions.',
  description:
    'Ethiopian Consumer Research Marketplace connecting organizations, businesses, and universities with research participants.',
  keywords: [
    'Consumer Research',
    'Ethiopia',
    'Surveys',
    'Product Testing',
    'Participant Recruitment',
    'Market Research',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

