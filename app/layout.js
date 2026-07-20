import './globals.css';

export const metadata = {
  title: 'Ledger — Personal Finance Dashboard',
  description: 'A clean, minimal expense and budget tracker with AI-powered spending insights.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body suppressHydrationWarning={true}>{children}</body>
    </html>
  );
}
