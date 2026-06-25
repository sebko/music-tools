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
    "px-3 py-2 rounded-base font-heading bg-transparent",
    "inline-flex items-center gap-2 cursor-pointer",
    "transition-colors duration-200 hover:text-main",
    isActive
      ? "text-main underline underline-offset-4 decoration-2"
      : "text-foreground",
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
