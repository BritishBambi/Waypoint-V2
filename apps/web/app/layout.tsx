import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
