import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trackfa.st | Analytics doctor",
  description: "Inspect analytics evidence, compare provider responses, and diagnose tracking failures.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
