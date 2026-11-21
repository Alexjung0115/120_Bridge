import type { Metadata } from "next";
import "pretendard-gov/dist/web/static/PretendardGOV-Regular.css";
import "pretendard-gov/dist/web/static/PretendardGOV-Bold.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "120Bridge",
  description: "120Bridge 프론트엔드",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
