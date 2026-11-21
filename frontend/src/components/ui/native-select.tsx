import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className="relative inline-flex max-w-full items-center">
      <select
        data-slot="native-select"
        className={cn(
          "min-h-9 max-w-full cursor-pointer appearance-none rounded-md border border-border-gray bg-background-white py-1.5 pl-3 pr-8 text-sm text-text-basic shadow-xs transition-colors hover:bg-element-gray-lighter focus-visible:ring-2 focus-visible:ring-border-primary disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 size-4 text-text-subtle" />
    </div>
  );
}

export function NativeSelectOption(props: ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}
