"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { Tier } from "@/lib/tier";

interface TierContextValue {
  tier: Tier;
  setTier: (tier: Tier) => void;
}

const TierContext = createContext<TierContextValue | undefined>(undefined);

export function TierProvider({ children }: { children: ReactNode }) {
  // All features are unlocked — tier is always "plus"
  const tier: Tier = "plus";
  const setTier = () => {};

  return (
    <TierContext.Provider value={{ tier, setTier }}>
      {children}
    </TierContext.Provider>
  );
}

export function useTier(): TierContextValue {
  const context = useContext(TierContext);
  if (!context) {
    throw new Error("useTier must be used within a TierProvider");
  }
  return context;
}
