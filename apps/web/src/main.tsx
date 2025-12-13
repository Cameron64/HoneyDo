import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { TRPCProvider } from '@/providers/TRPCProvider';
import { App } from './App';
import '@/styles/globals.css';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  console.warn('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
}

// Get the current URL for Clerk redirects (works for both localhost and Tailscale)
const currentOrigin = window.location.origin;

// Allowed redirect origins for Tailscale/LAN access
const allowedRedirectOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'https://localhost:5173',
  'https://localhost:3001',
  'https://localhost:8443',
  'http://cams-work-comp.taila29c19.ts.net',
  'http://cams-work-comp.taila29c19.ts.net:5173',
  'http://cams-work-comp.taila29c19.ts.net:8080',
  'https://cams-work-comp.taila29c19.ts.net',
  'https://cams-work-comp.taila29c19.ts.net:5173',
  'https://cams-work-comp.taila29c19.ts.net:3001',
  'https://cams-work-comp.taila29c19.ts.net:8443',
];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder'}
      afterSignInUrl={currentOrigin}
      afterSignUpUrl={currentOrigin}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      allowedRedirectOrigins={allowedRedirectOrigins}
    >
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </ClerkProvider>
  </StrictMode>
);
