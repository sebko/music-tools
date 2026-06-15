import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NavLink } from "@music-tools/my-component-library";
import { ChevronDown, Settings } from "lucide-react";

const TOOLS = [
  { to: "/favourites-wizard", label: "Favourites Wizard" },
  { to: "/album-deleter", label: "Album Deleter" },
  { to: "/sync-to-files", label: "Plex → Files" },
  { to: "/files-to-plex", label: "Files → Plex" },
  { to: "/settings", label: "Settings", icon: Settings },
];

function ToolsMenu() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const isToolActive = TOOLS.some((tool) => location.pathname.startsWith(tool.to));

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Close the menu whenever navigation changes the route.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative" ref={containerRef}>
      <NavLink
        isActive={isToolActive}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Tools
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </NavLink>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 z-50 flex flex-col gap-2 p-2 min-w-[14rem] rounded-base border-2 border-border bg-background-secondary shadow-base"
        >
          {TOOLS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              isActive={location.pathname.startsWith(to)}
              asChild
              className="w-full justify-start hover:bg-background"
            >
              <Link to={to} role="menuitem">
                {Icon && <Icon className="w-4 h-4" />} {label}
              </Link>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default ToolsMenu;
