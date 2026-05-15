"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type React from "react";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)] shrink-0 items-center rounded-full p-px outline-none transition-[background-color,box-shadow,border-color] duration-200 [--thumb-size:--spacing(5)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background sm:[--thumb-size:--spacing(4)]",
        "border border-transparent shadow-inner",
        "data-unchecked:border-border/80 data-unchecked:bg-muted data-unchecked:shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]",
        "dark:data-unchecked:border-border dark:data-unchecked:bg-muted/60 dark:data-unchecked:shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)]",
        "data-checked:border-primary data-checked:bg-primary data-checked:shadow-sm",
        "data-disabled:cursor-not-allowed data-disabled:opacity-80",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block aspect-square h-full origin-left border border-border/25 bg-background shadow-sm in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:not-data-disabled:scale-x-110 in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.1)] rounded-(--thumb-size) will-change-transform [transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s] data-checked:origin-[var(--thumb-size)_50%] data-checked:translate-x-[calc(var(--thumb-size)-4px)] data-checked:border-primary-foreground/15 dark:border-border/50 dark:data-checked:border-primary-foreground/25",
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export { SwitchPrimitive };
