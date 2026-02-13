import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";

const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "DOCX Generator",
  description: "Generate DOCX files from template"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={kanit.variable}>
      <body>
        <div className="fixed right-3 top-3 z-[60] rounded-xl bg-black px-2 py-1 text-xs font-medium text-white shadow-lg">
          Tailwind OK
        </div>
        {children}
      </body>
    </html>
  );
}
