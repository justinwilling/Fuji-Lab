import "./globals.css";
import "./preview-fix.css";

export const metadata = {
  title: "Fuji Recipe Lab v3",
  description: "Pixel-based Fujifilm RAW and recipe editor"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
