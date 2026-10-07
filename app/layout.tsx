import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACHOURADAR — Inteligência para viajar melhor",
  description: "Você procura. O ACHOURADAR encontra oportunidades de voos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
