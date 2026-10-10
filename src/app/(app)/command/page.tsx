import { Suspense } from 'react';
import { CommandChat } from '@/components/command/command-chat';

export default function CommandPage() {
  // The chat reads `?chat=` from the address bar, which needs a boundary.
  return (
    <Suspense fallback={null}>
      <CommandChat />
    </Suspense>
  );
}
