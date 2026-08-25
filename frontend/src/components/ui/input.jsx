import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, onFocus, onChange, ...props }, ref) => {
  const handleFocus = React.useCallback((e) => {
    if (type === "number" && (e.target.value === "0" || e.target.value === 0)) {
      e.target.select?.();
    }
    onFocus?.(e);
  }, [type, onFocus]);

  const handleChange = React.useCallback((e) => {
    if (type === "number" && typeof e.target?.value === "string") {
      const val = e.target.value;
      if (/^0[0-9]+$/.test(val)) {
        e.target.value = val.replace(/^0+(?=\d)/, "");
      }
    }
    onChange?.(e);
  }, [type, onChange]);

  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      onFocus={handleFocus}
      onChange={handleChange}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
