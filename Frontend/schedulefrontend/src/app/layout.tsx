// app/layout.tsx
import "./globals.css";
import Brand from "@/components/ui/brand";
import ThemeProvider from "./theme-provider";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n";
import { GlobalMessageToaster } from "@/components/messages/GlobalMessageToaster";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schedule-It - Schedule it your way",
  description: "Professional scheduling and workforce management platform for businesses and employees",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    other: [
      { rel: "android-chrome-192x192", url: "/favicon-192x192.png" },
      { rel: "android-chrome-512x512", url: "/favicon-512x512.png" },
    ],
  },
  manifest: "/manifest.json",
};

const PRE_HYDRATION_SCRIPT = `
(function () {
  try {
    var path = window.location.pathname;
    // Skip auth-related pages
    if (/^\\/(auth|signin|login)(\\/|$)/.test(path)) {
      return;
    }

    var cookie = document.cookie
      .split('; ')
      .find(function (part) {
        return part.indexOf('theme=') === 0;
      });

    var theme = cookie
      ? decodeURIComponent(cookie.split('=')[1])
      : (window.localStorage && window.localStorage.getItem('theme')) ||
        (window.matchMedia &&
         window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light');

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    // swallow errors to avoid breaking the page
  }
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get
    ? cookieStore.get("theme")?.value
    : undefined;
  const htmlClass = cookieTheme === "dark" ? "dark" : "";

  return (
    <html lang="en" className={htmlClass}>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SCRIPT }}
        />
      </head>
      <body className="theme-scheduleit">
        <I18nProvider>
          <ThemeProvider />
          <Brand />
          <GlobalMessageToaster />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
