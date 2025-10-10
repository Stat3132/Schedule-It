import "./globals.css";
import Brand from "@/components/ui/brand";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="theme-scheduleit">
        <Brand />
        {children}
        </body>
    </html>
  );
}
