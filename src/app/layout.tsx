import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "দৃষ্টি — DRISHTI AI",
  description: "দৃষ্টিপ্রতিবন্ধী মানুষের জন্য বাংলা-ফার্স্ট লোকাল অ্যাক্সেসিবিলিটি সঙ্গী।",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0a0e17",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn">
      <body>
        <a href="#main-content" className="skip-to-content">
          মূল বিষয়ে যান (Skip to content)
        </a>
        <main id="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
