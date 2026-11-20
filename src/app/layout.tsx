import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FER AI", template: "%s · FER AI" },
  description: "Gestión operativa para pequeñas empresas",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CR">
      <body>
        <a className="skip" href="#contenido">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
