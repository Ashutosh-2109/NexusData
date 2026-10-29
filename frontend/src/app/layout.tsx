import type { Metadata } from "next";
import localFont from 'next/font/local';
import 'leaflet/dist/leaflet.css';
import '../styles/tokens.css';
import "./globals.css";
import AppShell from '../components/AppShell';

const displayFont = localFont({ src: '../styles/fonts/CascadiaCode.ttf', variable: '--font-display', display: 'swap' });
const bodyFont = localFont({ src: '../styles/fonts/CascadiaMono.ttf', variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: "NexusData — Cross-Domain Insight Discovery Engine",
  description: "Automated multi-dataset temporal alignment, spatial harmonization, and exploratory data analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}><body><AppShell>{children}</AppShell></body></html>;
}
