import type { ComponentPropsWithoutRef } from "react";

const tones = {
  neutral: "bg-element-gray-light text-text-basic",
  primary: "bg-element-primary-lighter text-text-primary",
  success: "bg-element-success-lighter text-text-success",
  warning: "bg-element-warning-lighter text-text-warning",
  danger: "bg-element-danger-lighter text-text-danger",
  information: "bg-element-information-lighter text-text-information",
} as const;

const sizes = {
  sm: "rounded-guide-small px-2 py-0.5 type-body-xsmall",
  md: "rounded-guide-medium-3 px-3 py-1.5 type-body-small",
} as const;

export type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  tone?: keyof typeof tones;
  size?: keyof typeof sizes;
};

export function Badge({ tone = "neutral", size = "sm", className = "", ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center justify-center gap-1 align-middle ${tones[tone]} ${sizes[size]} ${className}`}
    />
  );
}
