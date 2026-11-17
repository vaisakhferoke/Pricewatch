import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

const head = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-head" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--f-body" });

export const metadata = { title: "Pricewatch", description: "Track Amazon and Flipkart prices with Telegram alerts" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${head.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
