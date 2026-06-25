import { useTheme } from '../hooks/useTheme';
import { cn } from '../lib/utils';
import { Sun, Moon, Monitor } from 'lucide-react';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light', icon: Sun, title: 'Light mode' },
    { value: 'system', icon: Monitor, title: 'System preference' },
    { value: 'dark', icon: Moon, title: 'Dark mode' }
  ];

  return (
    <fieldset className="flex items-center bg-background-secondary rounded-base border-2 border-border shadow-base p-1">
      <legend className="sr-only">Theme selection</legend>
      {options.map((option) => {
        const IconComponent = option.icon;
        const isSelected = theme === option.value;
        return (
          <label
            key={option.value}
            className="relative cursor-pointer"
            title={option.title}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={isSelected}
              onChange={() => setTheme(option.value)}
              className="sr-only"
            />
            <div className={cn(
              "p-2 rounded transition-all duration-200 flex items-center justify-center",
              isSelected
                ? "bg-main text-main-foreground shadow-light"
                : "text-foreground/60 hover:text-foreground hover:bg-background/50"
            )}>
              <IconComponent className="w-4 h-4" />
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}

export default ThemeToggle;
