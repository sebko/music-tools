import { useContext } from "react";
import { LibraryContext } from "../contexts/libraryContext.js";

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used within LibraryProvider");
  return context;
}
