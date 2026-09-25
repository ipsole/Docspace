'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CRMRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/leads');
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="animate-pulse text-xs font-semibold text-gray-400">
        Redirecting to Leads Pipeline...
      </div>
    </div>
  );
}
