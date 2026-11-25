import type { Metadata } from "next";
import { Anek_Devanagari } from "next/font/google";
import { DEFAULT_LOCALE, getUiStrings, LOCALE_META } from "@/lib/i18n";
import "./globals.css";

const anek = Anek_Devanagari({
  variable: "--font-anek",
  subsets: ["latin", "devanagari"],
  axes: ["wdth"],
  display: "swap",
});

const t = getUiStrings(DEFAULT_LOCALE);

export const metadata: Metadata = {
  title: t.app.name,
  description: t.app.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={LOCALE_META[DEFAULT_LOCALE].htmlLang} className={`${anek.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
