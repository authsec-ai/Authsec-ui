import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type TableDensity = "comfortable" | "compact";

const STORAGE_KEY = "authsec_table_density";

interface DensityContextValue {
  density: TableDensity;
  setDensity: (density: TableDensity) => void;
  toggleDensity: () => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

function readStoredDensity(): TableDensity {
  if (typeof window === "undefined") return "comfortable";
  return window.localStorage.getItem(STORAGE_KEY) === "compact" ? "compact" : "comfortable";
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<TableDensity>(readStoredDensity);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, density);
  }, [density]);

  return (
    <DensityContext.Provider
      value={{
        density,
        setDensity: setDensityState,
        toggleDensity: () =>
          setDensityState((d) => (d === "comfortable" ? "compact" : "comfortable")),
      }}
    >
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity() {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used within a DensityProvider");
  return ctx;
}
