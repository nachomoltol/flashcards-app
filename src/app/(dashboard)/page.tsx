'use client';

import dynamic from 'next/dynamic';
import { DecksSkeleton } from '@/components/decks';

const DecksView = dynamic(() => import('@/components/decks/DecksView'), {
  ssr: false,
  loading: () => <DecksSkeleton />,
});

export default function DashboardPage() {
  return <DecksView />;
}
