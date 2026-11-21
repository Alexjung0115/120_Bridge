import type { Metadata } from "next";

export const metadata: Metadata = { title: "시민 화면 | 120Bridge" };

export default function CitizenLayout({ children }: LayoutProps<"/citizen">) {
  return children;
}
