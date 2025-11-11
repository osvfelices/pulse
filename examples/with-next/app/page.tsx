import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Pulse 1.0.0 with Next.js Demo</h1>
      <p>Demonstrates Pulse deterministic runtime integrated with Next.js API routes.</p>
      <p>
        <Link href="/pulse" style={{ color: 'blue', textDecoration: 'underline' }}>
          Go to Pulse Determinism Demo
        </Link>
      </p>
    </main>
  );
}
