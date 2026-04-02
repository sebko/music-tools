import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import Button from "./Button";

/**
 * Page navigation controls with prev/next and page counter
 * @param {Object} props
 * @param {number} props.currentPage
 * @param {number} props.totalPages
 * @param {function} props.onPageChange - (newPage: number) => void
 * @param {string} [props.className]
 */
function Pagination({ currentPage, totalPages, onPageChange, className }) {
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className={cn("flex justify-center items-center gap-4", className)}>
      <Button
        variant={hasPrev ? "primary" : "secondary"}
        size="sm"
        isDisabled={!hasPrev}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft className="w-4 h-4" />
        Previous
      </Button>
      <span className="text-foreground font-heading text-sm tabular-nums">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant={hasNext ? "primary" : "secondary"}
        size="sm"
        isDisabled={!hasNext}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default Pagination;
