import "./globals.css";
import Brand from "@/components/ui/brand";
import ThemeProvider from './theme-provider';
import { cookies } from 'next/headers';
import { I18nProvider } from '@/lib/i18n';

const PRE_HYDRATION_SCRIPT = `(function(){try{var p=location.pathname;if(/^\\/(?:auth|signin|signup|login)(?:$|\\/)/.test(p))return;var c=document.cookie.split('; ').find(function(r){return r.indexOf('theme=')===0});var theme=c?decodeURIComponent(c.split('=')[1]):(localStorage.getItem('theme')|| (window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));if(theme==='dark')document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){} })();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get ? cookieStore.get('theme')?.value : undefined;
  const htmlClass = cookieTheme === 'dark' ? 'dark' : '';

  return (
    <html lang="en" className={htmlClass}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SCRIPT }} />
      </head>
      <body className="theme-scheduleit">
        <I18nProvider>
          <ThemeProvider />
          <Brand />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
