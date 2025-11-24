"use client";
import { useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { usePathname } from 'next/navigation';

export default function ThemeProvider(): null {
  const supabase = createClientComponentClient();
  const pathname = usePathname();

  // Apply persisted theme to document root so Tailwind `dark:` styles work.
  // If a logged-in user has a saved preference in their user_metadata, prefer that.
  useEffect(() => {
    // Don't run on auth pages (signup/signin/login) — those should not be themed by user preference.
    if (typeof pathname === 'string' && (pathname.startsWith('/signup') || pathname.startsWith('/signin') || pathname.startsWith('/auth') || pathname.startsWith('/login'))) {
      return;
    }

    let mounted = true;

    const apply = (theme: string | null) => {
      if (typeof document === 'undefined') return;
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const setup = async () => {
      try {
        // Try to get the logged-in user; if they have a saved theme, use it.
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;
        const metadata = (user && typeof user === 'object' ? (user as unknown as Record<string, unknown>).user_metadata : undefined) as Record<string, unknown> | undefined;
        if (mounted && user && metadata && typeof metadata.theme === 'string') {
          const t = String(metadata.theme);
          if (t === 'dark' || t === 'light') {
            apply(t);
            try { localStorage.setItem('theme', t); } catch {}
            return;
          }
        }

        // Otherwise fall back to localStorage or OS preference.
        let saved: string | null = null;
        try { saved = localStorage.getItem('theme'); } catch {}
        if (saved === 'dark' || saved === 'light') {
          apply(saved);
          return;
        }

        if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          apply('dark');
        }
      } catch {
        // ignore
      }
    };

    setup();

    // Listen for storage events (sync across tabs)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme') {
        apply(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      mounted = false;
      window.removeEventListener('storage', onStorage);
    };
  }, [pathname, supabase]);

  return null;
}
