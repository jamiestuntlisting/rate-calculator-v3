import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TierProvider } from "@/context/tier-context";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StuntListing Bookkeeper",
  description:
    "Track stunt performer work days, calculate rates, and manage payments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <TierProvider>
          <AppHeader />
          <main className="flex-1 container mx-auto px-4 py-6">
            {children}
          </main>
          <AppFooter />
          <Toaster />
        </TierProvider>
      </body>
    </html>
  );
}
