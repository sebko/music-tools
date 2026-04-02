import React from "react";
import { cn } from "../lib/utils";

/**
 * Styled navigation link with active state and asChild support
 * Router-agnostic — wrap with your router's Link component via asChild
 * @param {Object} props
 * @param {boolean} [props.isActive=false] - Whether this link is currently active
 * @param {boolean} [props.asChild=false] - Render as child element with NavLink styling
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
function NavLink({ isActive = false, asChild = false, className, children, ...props }) {
  const navClasses = cn(
    "px-4 py-2 rounded-base font-heading text-sm",
    "border-2 border-border shadow-light",
    "hover:shadow-base hover:-translate-x-0.5 hover:-translate-y-0.5",
    "active:shadow-none active:translate-x-0 active:translate-y-0",
    "transition-all duration-200 bg-background",
    "inline-flex items-center gap-2",
    isActive ? "text-main" : "text-foreground",
    className
  );

  if (asChild) {
    const child = children;
    return React.cloneElement(child, {
      className: cn(navClasses, child.props.className),
      ...props,
    });
  }

  return (
    <button className={navClasses} {...props}>
      {children}
    </button>
  );
}

export default NavLink;
