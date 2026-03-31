import { cn } from "../lib/utils";
import React, { forwardRef } from "react";

/**
 * @param {Object} props
 * @param {'default'|'primary'|'secondary'|'destructive'} [props.variant='default']
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} [props.size='md']
 * @param {boolean} [props.isLoading=false]
 * @param {boolean} [props.isDisabled=false]
 * @param {boolean} [props.asChild=false]
 * @param {string} [props.className]
 * @param {boolean} [props.disabled]
 * @param {React.ReactNode} [props.children]
 */
const Button = forwardRef(
  ({
    variant = "default",
    size = "md",
    isLoading = false,
    isDisabled = false,
    asChild = false,
    className,
    disabled,
    children,
    ...props
  }, ref) => {
    const isButtonDisabled = disabled || isDisabled || isLoading;

    const buttonClasses = cn(
      // Base neobrutalism styles with accessibility min-height
      "inline-flex items-center justify-center gap-2 rounded-base font-heading border-base transition-all duration-200 min-h-[44px]",
      "hover:shadow-heavy hover:-translate-x-0.5 hover:-translate-y-0.5",
      "active:shadow-none active:translate-x-0 active:translate-y-0",
      "disabled:opacity-50 disabled:cursor-not-allowed disabled:text-foreground/60",
      "disabled:hover:shadow-base disabled:hover:translate-x-0 disabled:hover:translate-y-0",

      // Size variants
      {
        "px-2 py-1 text-xs": size === "xs",
        "px-3 py-2 text-sm": size === "sm",
        "px-4 py-2 text-sm": size === "md",
        "px-6 py-3 text-base": size === "lg",
        "px-8 py-4 text-lg": size === "xl",
      },

      // Variant styles
      {
        "shadow-base bg-background text-foreground": variant === "default",
        "shadow-base bg-main text-main-foreground": variant === "primary",
        "shadow-light bg-background-secondary text-foreground": variant === "secondary",
        "shadow-base bg-destructive text-main-foreground": variant === "destructive",
      },

      className
    );

    if (asChild) {
      const child = children;
      return React.cloneElement(child, {
        className: cn(buttonClasses, child.props.className),
        ...props,
      });
    }

    return (
      <button
        ref={ref}
        disabled={isButtonDisabled}
        className={buttonClasses}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
