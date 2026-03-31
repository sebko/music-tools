import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Button from "./Button";

function SelectBrutalist({
  value,
  onChange,
  options,
  id,
  className = ""
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Find the label for the current value
  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label || options[0]?.label || "";

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOptionClick = (optionValue) => {
    onChange({ target: { value: optionValue } });
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <Button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        variant="default"
        size="sm"
        className={`
          w-full text-left justify-between font-base
          ${isOpen ? 'shadow-heavy -translate-x-0.5 -translate-y-0.5' : ''}
        `}
      >
        <span>{displayText}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </Button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2">
          <div className="rounded-base border-base shadow-heavy bg-background overflow-hidden">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleOptionClick(option.value)}
                className={`
                  w-full px-3 py-2 text-sm text-left
                  hover:bg-main hover:text-main-foreground
                  transition-colors duration-150
                  font-base
                  ${option.value === value ? 'bg-main/10' : ''}
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectBrutalist;
