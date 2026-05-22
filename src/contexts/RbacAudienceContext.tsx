import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type RbacAudience = "admin" | "endUser";

interface RbacAudienceContextValue {
  audience: RbacAudience;
  isAdmin: boolean;
  setAudience: (next: RbacAudience) => void;
  toggleAudience: () => void;
}

const RbacAudienceContext = createContext<RbacAudienceContextValue | undefined>(
  undefined
);

export function RbacAudienceProvider({ children }: { children: ReactNode }) {
  const value = useMemo<RbacAudienceContextValue>(
    () => ({
      audience: "admin",
      isAdmin: true,
      setAudience: () => {},
      toggleAudience: () => {},
    }),
    []
  );

  return (
    <RbacAudienceContext.Provider value={value}>
      {children}
    </RbacAudienceContext.Provider>
  );
}

export function useRbacAudience() {
  const context = useContext(RbacAudienceContext);
  if (!context) {
    throw new Error(
      "useRbacAudience must be used within a RbacAudienceProvider"
    );
  }
  return context;
}
