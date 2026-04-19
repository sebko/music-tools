import { ToggleGroup } from "@dj-tools/my-component-library";
import { useLibrary } from "../hooks/useLibrary";

function LibraryToggle() {
  const { activeLibrary, switchLibrary, availableLibraries } = useLibrary();

  if (availableLibraries.length <= 1) return null;

  const options = availableLibraries.map((name) => ({
    value: name,
    label: name,
  }));

  return (
    <ToggleGroup
      options={options}
      value={activeLibrary}
      onChange={switchLibrary}
      size="sm"
    />
  );
}

export default LibraryToggle;
