import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Toaster } from "@/components/Toaster";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waypoint",
  description: "Waypoint",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:ring-2 focus:ring-violet-500 focus:outline-none"
        >
          Skip to content
        </a>
        <Providers>
          <Toaster />
          <Nav />
          <div id="main-content" tabIndex={-1} className="outline-none">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
