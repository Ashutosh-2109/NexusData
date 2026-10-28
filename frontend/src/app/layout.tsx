import type { Metadata } from "next";
import 'leaflet/dist/leaflet.css';
import "./globals.css";


export const metadata: Metadata = {
  title: "NexusData — Cross-Domain Insight Discovery Engine",
  description: "Automated multi-dataset temporal alignment, spatial harmonization, and Exploratory Data Analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark"
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-cyan-500/20 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
