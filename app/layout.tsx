import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import FloatingAiAgent from "@/app/_components/floating-ai-agent";
import { TaxApplicationStateProvider } from "@/app/_components/tax-application-state-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daňové přiznání pro s.r.o.",
  description:
    "MVP aplikace pro výpočet DPH a základního daňového přiznání české s.r.o.",
};

/** Root HTML layout shared by the application. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TaxApplicationStateProvider>
          {children}
          <FloatingAiAgent />
        </TaxApplicationStateProvider>
      </body>
    </html>
  );
}
