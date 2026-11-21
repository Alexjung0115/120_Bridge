import Image from "next/image";
import Link from "next/link";
import governmentIcon from "@/assets/icon/government.svg";

export function BridgeBrand({ variant = "citizen", href }: { variant?: "citizen" | "counselor"; href?: string }) {
  const counselor = variant === "counselor";

  return (
    <Link
      href={href ?? (counselor ? "/" : "/citizen")}
      aria-label={href === "/" || counselor ? "120 Bridge 홈" : "120Bridge 시민 홈"}
      className={counselor ? "flex items-center gap-2 whitespace-nowrap" : "inline-flex items-center guide-gap-3"}
    >
      <Image src={governmentIcon} alt="" aria-hidden="true" className="size-6" />
      {counselor ? (
        <strong className="text-3xl font-bold text-text-primary">120</strong>
      ) : (
        <span className="type-heading-medium text-element-primary">120</span>
      )}
      <span className={counselor ? "text-xl tracking-wide" : "type-body-small tracking-wider text-text-basic"}>BRIDGE</span>
    </Link>
  );
}
