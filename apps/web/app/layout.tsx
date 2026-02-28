import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
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
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
