import { cn } from "../lib/utils";

/**
 * Generic Modal component
 * Provides a reusable modal structure with backdrop and container
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Called when backdrop is clicked (optional)
 * @param {ReactNode} children - Modal content
 * @param {string} className - Additional classes for modal container
 * @param {string} maxWidth - Max width class (default: "max-w-md")
 * @param {boolean} closeOnBackdropClick - Whether clicking backdrop closes modal (default: true)
 */
function Modal({
  isOpen,
  onClose,
  children,
  className = "",
  maxWidth = "max-w-md",
  closeOnBackdropClick = true,
}) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (closeOnBackdropClick && e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-foreground/20 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div
        className={cn("modal-brutalist w-full mx-4", maxWidth, className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default Modal;
