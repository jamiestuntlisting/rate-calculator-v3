"use client";

import { useTier } from "@/context/tier-context";
import type { Tier } from "@/lib/tier";
import { TIER_LABELS } from "@/lib/tier";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const tierColors: Record<Tier, string> = {
  free: "bg-gray-800 text-gray-300",
  standard: "bg-blue-900/40 text-blue-300",
  plus: "bg-purple-900/40 text-purple-300",
};

export function TierToggle() {
  const { tier, setTier } = useTier();

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={`text-xs ${tierColors[tier]}`}>
        DEV
      </Badge>
      <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
        <SelectTrigger className="w-[120px] h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TIER_LABELS) as Tier[]).map((t) => (
            <SelectItem key={t} value={t}>
              {TIER_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
