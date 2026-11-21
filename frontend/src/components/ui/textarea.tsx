import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn("min-h-12 w-full rounded-guide-medium-1 border border-border-gray bg-background-white px-3 py-2 type-body-small text-text-basic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-primary disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}
