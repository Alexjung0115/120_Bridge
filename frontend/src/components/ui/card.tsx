import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  guide: "rounded-guide-xlarge border border-border-gray-light",
  console: "rounded-2xl border border-border-gray-light bg-background-white",
};

type CardTag = "section" | "div" | "li" | "p";

export function Card({
  as: Tag = "div", tone = "guide", className, ...props
}: HTMLAttributes<HTMLElement> & { as?: CardTag; tone?: keyof typeof tones }) {
  return <Tag data-slot="card" className={cn(tones[tone], className)} {...props} />;
}
