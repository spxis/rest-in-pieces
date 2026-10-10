export const metadata = { title: 'REST in Pieces with Next.js' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem auto', maxWidth: '48rem', padding: '0 1rem' }}>
        {children}
      </body>
    </html>
  );
}
