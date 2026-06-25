import { cn } from "../lib/utils";

/**
 * Centered empty/placeholder state with icon, heading, description, and optional action
 * @param {Object} props
 * @param {React.ReactNode} [props.icon] - Icon element
 * @param {string} props.heading - Main heading text
 * @param {React.ReactNode} [props.description] - Description text or JSX
 * @param {React.ReactNode} [props.action] - CTA button or link
 * @param {string} [props.className]
 */
function EmptyState({ icon, heading, description, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      {icon && <div className="mb-4 text-foreground/30">{icon}</div>}
      <h2 className="text-xl font-heading text-foreground mb-2">{heading}</h2>
      {description && (
        <p className="text-foreground/60 mb-6 max-w-md">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

export default EmptyState;
