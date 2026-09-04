import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gold Deal Finder — Compare ₹/gram prices across Indian jewellers",
  description: "Find where you get the most gold and silver for your money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
