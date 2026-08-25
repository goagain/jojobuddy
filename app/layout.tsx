import { cookies } from "next/headers";
import { Cinzel, Noto_Sans_SC } from "next/font/google";
import type { Metadata } from "next";
import { LocaleProvider } from "@/components/LocaleProvider";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n";
import "./globals.css";

const display = Cinzel({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-display",
});

const sans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "JoJobuddy — Stand out from the crowd",
  description: "Star Platinum rewrites your resume. Heaven's Door judges ATS fit. Your stand for job hunting.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const initialLocale: Locale = resolveLocale(jar.get(LOCALE_COOKIE)?.value);

  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable}`}>
        <LocaleProvider initialLocale={initialLocale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
