"use client";

import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';

type AuthLoadingScreenProps = {
  children?: ReactNode;
};

export default function AuthLoadingScreen({ children }: AuthLoadingScreenProps) {
  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000', paddingInline: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', color: '#ffffff' }}>
        <Spinner size={36} color="white" />
        {children ? <div style={{ maxWidth: 320, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{children}</div> : null}
      </div>
    </main>
  );
}
