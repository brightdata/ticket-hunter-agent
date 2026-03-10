import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Ticket Hunter — Find the Best Tickets with AI",
  description:
    "AI-powered ticket finder that autonomously browses StubHub, Ticketmaster, SeatGeek and more to find you the best available seats.",
  openGraph: {
    title: "Ticket Hunter — Find the Best Tickets with AI",
    description:
      "AI-powered ticket finder that autonomously browses StubHub, Ticketmaster, SeatGeek and more.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} min-h-screen bg-[#070b14] font-sans text-white antialiased`}
      >
        {/* Fixed background layers */}
        <div className="pointer-events-none fixed inset-0">
          {/* Ambient blue glow from top */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(61,127,252,0.1),transparent)]" />
          {/* Dot grid pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        {/* Page content sits above background */}
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}