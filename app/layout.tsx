import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mox Tournament Control",
  description: "Control de torneos TCG para Mox TCG.",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
