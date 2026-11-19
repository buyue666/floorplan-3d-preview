import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Floor Plan 3D Preview — geometry core MVP",
  description:
    "Validate a floor-plan polygon, triangulate it with earcut, repair it with polygon-clipping and preview it in 3D with live quantity takeoff.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
