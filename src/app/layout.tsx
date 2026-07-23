import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "@/styles/base.css";
import "@/styles/landing.css";
import "@/styles/auth.css";
import "@/styles/app.css";
import "@/styles/funnel.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Onboarding OS",
  description: "The system for client onboarding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
