"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { calculateRate } from "@/lib/rate-engine";
import type { ExhibitGInput, CalculationBreakdown } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestCase {
  id: string;
  name: string;
  description: string;
  input: ExhibitGInput;
  expectedTotal: number;
  actualTotal: number | null;
  breakdown: CalculationBreakdown | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Default ExhibitGInput factory
// ---------------------------------------------------------------------------

function defaultInput(overrides: Partial<ExhibitGInput> = {}): ExhibitGInput {
  const result: ExhibitGInput = {
    showName: "Test",
    workDate: "2026-02-24",
    callTime: "07:00",
    dismissOnSet: "15:30",
    dismissMakeupWardrobe: null,
    ndMealIn: null,
    ndMealOut: null,
    firstMealStart: "13:00",
    firstMealFinish: "13:30",
    secondMealStart: null,
    secondMealFinish: null,
    stuntAdjustment: 0,
    forcedCall: false,
    isSixthDay: false,
    isSeventhDay: false,
    isHoliday: false,
    workStatus: "theatrical_basic",
    characterName: "Test",
    notes: "",
    ...overrides,
  };
  // Default Wrapped to Dismiss On Set if not explicitly provided
  if (result.dismissMakeupWardrobe === null) {
    result.dismissMakeupWardrobe = result.dismissOnSet;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pre-seeded test cases
// ---------------------------------------------------------------------------

function getDefaultTests(): TestCase[] {
  return [
    {
      id: "1",
      name: "Short day (4h) — 8hr guarantee",
      description: "Call 7:00, dismiss 11:00, no meals. Should pay full daily rate ($1,246).",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "11:00",
        firstMealStart: null,
        firstMealFinish: null,
      }),
      expectedTotal: 1246.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "2",
      name: "Standard 8h day",
      description: "Call 7:00, dismiss 15:30, 30min lunch at 13:00. Exactly 8h worked.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "15:30",
        firstMealStart: "13:00",
        firstMealFinish: "13:30",
      }),
      expectedTotal: 1246.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "3",
      name: "10h day with OT",
      description: "Call 7:00, dismiss 17:30, 30min lunch. 10h worked = 8h@1x + 2h@1.5x.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "17:30",
        firstMealStart: "13:00",
        firstMealFinish: "13:30",
      }),
      expectedTotal: 1713.25,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "4",
      name: "No lunch penalty (7.5h, no meal)",
      description: "Call 7:00, dismiss 14:30, no meal taken. 7.5h worked but 6h meal deadline exceeded by 1.5h = $25+$35+$50 penalties.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "14:30",
        firstMealStart: null,
        firstMealFinish: null,
      }),
      expectedTotal: 1356.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "5",
      name: "ND (non-deductible) meal day",
      description: "Call 7:00, NDB 8:00-8:30 (within 2h, counts as work), lunch 12:00-12:30, dismiss 15:30. 8h net worked.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "15:30",
        ndMealIn: "08:00",
        ndMealOut: "08:30",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
      }),
      expectedTotal: 1246.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "6",
      name: "Stunt adjustment > base rate",
      description: "8h day with $2,000 stunt adjustment. Adjusted daily = $3,246.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "15:30",
        firstMealStart: "13:00",
        firstMealFinish: "13:30",
        stuntAdjustment: 2000,
      }),
      expectedTotal: 3246.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "7",
      name: "16h day",
      description: "Call 6:00, dismiss 22:30, 30min lunch. 16h = 8@1x + 2@1.5x + 6@2x + $360 2nd meal penalties.",
      input: defaultInput({
        callTime: "06:00",

        dismissOnSet: "22:30",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
      }),
      expectedTotal: 3942.25,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "8",
      name: "24h day (overnight)",
      description: "Call 6:00, dismiss 06:00 next day, two 30min meals. 23h net + $460 3rd meal penalties.",
      input: defaultInput({
        callTime: "06:00",

        dismissOnSet: "06:00",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
        secondMealStart: "18:30",
        secondMealFinish: "19:00",
      }),
      expectedTotal: 6222.75,
      actualTotal: null,
      breakdown: null,
      error: null,
    },

    // --- $100 Stunt Adjustment variants ---

    {
      id: "9",
      name: "Short day (4h) +$100 adj — 8hr guarantee",
      description: "Call 7:00, dismiss 11:00, no meals. $100 stunt adj. Minimum = $1,346.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "11:00",
        firstMealStart: null,
        firstMealFinish: null,
        stuntAdjustment: 100,
      }),
      expectedTotal: 1346.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "10",
      name: "Standard 8h day +$100 adj",
      description: "Call 7:00, dismiss 15:30, 30min lunch. $100 stunt adj. 8h × $168.25 = $1,346.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "15:30",
        firstMealStart: "13:00",
        firstMealFinish: "13:30",
        stuntAdjustment: 100,
      }),
      expectedTotal: 1346.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "11",
      name: "10h day with OT +$100 adj",
      description: "Call 7:00, dismiss 17:30, 30min lunch. $100 stunt adj. 8h@1x + 2h@1.5x at $168.25/hr.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "17:30",
        firstMealStart: "13:00",
        firstMealFinish: "13:30",
        stuntAdjustment: 100,
      }),
      expectedTotal: 1850.75,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "12",
      name: "No lunch penalty +$100 adj",
      description: "Call 7:00, dismiss 14:30, no meal. $100 stunt adj. 8hr min $1,346 + meal penalties.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "14:30",
        firstMealStart: null,
        firstMealFinish: null,
        stuntAdjustment: 100,
      }),
      expectedTotal: 1456.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "13",
      name: "ND meal day +$100 adj",
      description: "Call 7:00, NDB 8:00-8:30, lunch 12:00-12:30, dismiss 15:30. $100 stunt adj. 8h = $1,346.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "15:30",
        ndMealIn: "08:00",
        ndMealOut: "08:30",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
        stuntAdjustment: 100,
      }),
      expectedTotal: 1346.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "14",
      name: "8h day +$100 adj (was $2k adj test)",
      description: "8h day with $100 stunt adj instead of $2,000. Adjusted daily = $1,346.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "15:30",
        firstMealStart: "13:00",
        firstMealFinish: "13:30",
        stuntAdjustment: 100,
      }),
      expectedTotal: 1346.0,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "15",
      name: "16h day +$100 adj",
      description: "Call 6:00, dismiss 22:30, 30min lunch. $100 stunt adj. 8@1x + 2@1.5x + 6@2x at $168.25/hr + $360 2nd meal penalties.",
      input: defaultInput({
        callTime: "06:00",

        dismissOnSet: "22:30",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
        stuntAdjustment: 100,
      }),
      expectedTotal: 4229.75,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
    {
      id: "16",
      name: "24h day (overnight) +$100 adj",
      description: "Call 6:00, dismiss 06:00 next day, two 30min meals. $100 stunt adj. 23h net + $460 3rd meal penalties.",
      input: defaultInput({
        callTime: "06:00",

        dismissOnSet: "06:00",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
        secondMealStart: "18:30",
        secondMealFinish: "19:00",
        stuntAdjustment: 100,
      }),
      expectedTotal: 6685.25,
      actualTotal: null,
      breakdown: null,
      error: null,
    },

    // --- 12h day with large stunt adjustment ---

    {
      id: "17",
      name: "12h day +$1,300 adj (adj > base, extended straight)",
      description: "Call 7:00, dismiss 20:00, two 30min meals. $1,300 adj > $1,246 base → straight time to hr 12, no 1.5x tier, 2x at 13+. 12@1x at $318.25/hr.",
      input: defaultInput({
        callTime: "07:00",

        dismissOnSet: "20:00",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
        secondMealStart: "18:00",
        secondMealFinish: "18:30",
        stuntAdjustment: 1300,
      }),
      expectedTotal: 3819.00,
      actualTotal: null,
      breakdown: null,
      error: null,
    },

    // --- 14h day with large stunt adjustment (double time kicks in) ---

    {
      id: "18",
      name: "14h day +$1,300 adj (adj > base, into double time)",
      description: "Call 7:00, dismiss 22:00, two 30min meals. $1,300 adj > $1,246 base → straight to hr 12, 2x at 13+. 12@1x + 2@2x at $318.25/hr.",
      input: defaultInput({
        callTime: "07:00",
        dismissOnSet: "22:00",
        firstMealStart: "12:00",
        firstMealFinish: "12:30",
        secondMealStart: "18:00",
        secondMealFinish: "18:30",
        stuntAdjustment: 1300,
      }),
      expectedTotal: 5092.00,
      actualTotal: null,
      breakdown: null,
      error: null,
    },
  ];
}

const STORAGE_KEY = "stl_test_bench";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TestBenchPage() {
  const { user, loading, isAdmin } = useAuth();
  const [tests, setTests] = useState<TestCase[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  // Load tests from localStorage or use defaults
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setTests(JSON.parse(stored));
      } catch {
        setTests(getDefaultTests());
      }
    } else {
      setTests(getDefaultTests());
    }
  }, []);

  // Persist to localStorage on change (only after initial load)
  useEffect(() => {
    if (tests.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tests));
    }
  }, [tests]);

  const runTest = useCallback((tc: TestCase): TestCase => {
    try {
      const breakdown = calculateRate(tc.input);
      return {
        ...tc,
        actualTotal: breakdown.grandTotal,
        breakdown,
        error: null,
      };
    } catch (err) {
      return {
        ...tc,
        actualTotal: null,
        breakdown: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, []);

  const runAll = useCallback(() => {
    setTests((prev) => prev.map(runTest));
    setHasRun(true);
  }, [runTest]);

  const addTest = useCallback(() => {
    const id = String(Date.now());
    setTests((prev) => [
      ...prev,
      {
        id,
        name: "New Test",
        description: "",
        input: defaultInput(),
        expectedTotal: 0,
        actualTotal: null,
        breakdown: null,
        error: null,
      },
    ]);
    setExpandedId(id);
  }, []);

  const deleteTest = useCallback((id: string) => {
    setTests((prev) => prev.filter((t) => t.id !== id));
    setExpandedId(null);
  }, []);

  const updateTest = useCallback((id: string, updates: Partial<TestCase>) => {
    setTests((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, actualTotal: null, breakdown: null, error: null } : t))
    );
  }, []);

  const updateInput = useCallback(
    (id: string, field: keyof ExhibitGInput, value: unknown) => {
      setTests((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, input: { ...t.input, [field]: value }, actualTotal: null, breakdown: null, error: null }
            : t
        )
      );
    },
    []
  );

  const resetToDefaults = useCallback(() => {
    setTests(getDefaultTests());
    setHasRun(false);
    setExpandedId(null);
  }, []);

  // Stats
  const passed = tests.filter((t) => t.actualTotal !== null && Math.abs(t.actualTotal - t.expectedTotal) < 0.01).length;
  const failed = tests.filter((t) => t.actualTotal !== null && Math.abs(t.actualTotal - t.expectedTotal) >= 0.01).length;
  const errors = tests.filter((t) => t.error !== null).length;

  if (loading) return null;
  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rate Calculator Test Bench</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            Reset Defaults
          </Button>
          <Button variant="outline" size="sm" onClick={addTest}>
            <Plus className="h-4 w-4 mr-1" /> Add Test
          </Button>
          <Button size="sm" onClick={runAll}>
            <Play className="h-4 w-4 mr-1" /> Run All Tests
          </Button>
        </div>
      </div>

      {hasRun && (
        <div className="flex gap-4">
          <Card className="flex-1">
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-xl font-bold">{tests.length}</div>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-green-500">Passed</div>
              <div className="text-xl font-bold text-green-500">{passed}</div>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-red-500">Failed</div>
              <div className="text-xl font-bold text-red-500">{failed}</div>
            </CardContent>
          </Card>
          {errors > 0 && (
            <Card className="flex-1">
              <CardContent className="pt-4 pb-4">
                <div className="text-sm text-yellow-500">Errors</div>
                <div className="text-xl font-bold text-yellow-500">{errors}</div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Test Cases</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Test Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((tc) => {
                const isExpanded = expandedId === tc.id;
                const isPassing =
                  tc.actualTotal !== null &&
                  Math.abs(tc.actualTotal - tc.expectedTotal) < 0.01;
                const isFailing =
                  tc.actualTotal !== null &&
                  Math.abs(tc.actualTotal - tc.expectedTotal) >= 0.01;

                return (
                  <TestRow
                    key={tc.id}
                    tc={tc}
                    isExpanded={isExpanded}
                    isPassing={isPassing}
                    isFailing={isFailing}
                    onToggle={() => setExpandedId(isExpanded ? null : tc.id)}
                    onDelete={() => deleteTest(tc.id)}
                    onUpdate={(updates) => updateTest(tc.id, updates)}
                    onUpdateInput={(field, value) => updateInput(tc.id, field, value)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TestRow sub-component
// ---------------------------------------------------------------------------

function TestRow({
  tc,
  isExpanded,
  isPassing,
  isFailing,
  onToggle,
  onDelete,
  onUpdate,
  onUpdateInput,
}: {
  tc: TestCase;
  isExpanded: boolean;
  isPassing: boolean;
  isFailing: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<TestCase>) => void;
  onUpdateInput: (field: keyof ExhibitGInput, value: unknown) => void;
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">{tc.name}</TableCell>
        <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
          {tc.description}
        </TableCell>
        <TableCell className="text-right font-mono">
          ${tc.expectedTotal.toFixed(2)}
        </TableCell>
        <TableCell className="text-right font-mono">
          {tc.actualTotal !== null ? `$${tc.actualTotal.toFixed(2)}` : "—"}
        </TableCell>
        <TableCell className="text-center">
          {tc.error ? (
            <Badge variant="destructive">Error</Badge>
          ) : isPassing ? (
            <Badge className="bg-green-600 hover:bg-green-700">Pass</Badge>
          ) : isFailing ? (
            <Badge variant="destructive">
              Fail ({tc.actualTotal !== null ? (tc.actualTotal - tc.expectedTotal >= 0 ? "+" : "") + (tc.actualTotal - tc.expectedTotal).toFixed(2) : ""})
            </Badge>
          ) : (
            <Badge variant="secondary">Not Run</Badge>
          )}
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            <TestEditor
              tc={tc}
              onUpdate={onUpdate}
              onUpdateInput={onUpdateInput}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// TestEditor sub-component (editable form for a test case)
// ---------------------------------------------------------------------------

function TestEditor({
  tc,
  onUpdate,
  onUpdateInput,
}: {
  tc: TestCase;
  onUpdate: (updates: Partial<TestCase>) => void;
  onUpdateInput: (field: keyof ExhibitGInput, value: unknown) => void;
}) {
  const inp = tc.input;

  return (
    <div className="space-y-4">
      {/* Test metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Test Name</Label>
          <Input
            value={tc.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Description</Label>
          <Input
            value={tc.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label>Expected Total ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={tc.expectedTotal}
            onChange={(e) =>
              onUpdate({ expectedTotal: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
        <div>
          <Label>Agreement Type</Label>
          <Select
            value={inp.workStatus}
            onValueChange={(v) => onUpdateInput("workStatus", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="theatrical_basic">Theatrical Basic ($1,246/day)</SelectItem>
              <SelectItem value="television">Television ($1,246/day)</SelectItem>
              <SelectItem value="stunt_coordinator">Stunt Coordinator ($1,938/day)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Stunt Adjustment ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={inp.stuntAdjustment}
            onChange={(e) =>
              onUpdateInput("stuntAdjustment", parseFloat(e.target.value) || 0)
            }
          />
        </div>
      </div>

      {/* Times */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TimeField label="Call Time" value={inp.callTime} onChange={(v) => onUpdateInput("callTime", v)} />
        <TimeField label="Dismiss On Set" value={inp.dismissOnSet} onChange={(v) => onUpdateInput("dismissOnSet", v)} />
        <TimeField label="Wrapped" value={inp.dismissMakeupWardrobe || ""} onChange={(v) => onUpdateInput("dismissMakeupWardrobe", v || null)} />
      </div>

      {/* Meals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TimeField label="ND Meal In" value={inp.ndMealIn || ""} onChange={(v) => onUpdateInput("ndMealIn", v || null)} />
        <TimeField label="ND Meal Out" value={inp.ndMealOut || ""} onChange={(v) => onUpdateInput("ndMealOut", v || null)} />
        <TimeField label="1st Meal Start" value={inp.firstMealStart || ""} onChange={(v) => onUpdateInput("firstMealStart", v || null)} />
        <TimeField label="1st Meal Finish" value={inp.firstMealFinish || ""} onChange={(v) => onUpdateInput("firstMealFinish", v || null)} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TimeField label="2nd Meal Start" value={inp.secondMealStart || ""} onChange={(v) => onUpdateInput("secondMealStart", v || null)} />
        <TimeField label="2nd Meal Finish" value={inp.secondMealFinish || ""} onChange={(v) => onUpdateInput("secondMealFinish", v || null)} />
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-6">
        <CheckboxField label="Forced Call" checked={inp.forcedCall} onChange={(v) => onUpdateInput("forcedCall", v)} />
        <CheckboxField label="6th Day" checked={inp.isSixthDay} onChange={(v) => onUpdateInput("isSixthDay", v)} />
        <CheckboxField label="7th Day" checked={inp.isSeventhDay} onChange={(v) => onUpdateInput("isSeventhDay", v)} />
        <CheckboxField label="Holiday" checked={inp.isHoliday} onChange={(v) => onUpdateInput("isHoliday", v)} />
      </div>

      {/* Breakdown (if run) */}
      {tc.breakdown && (() => {
        const b = tc.breakdown!;
        // Group meal penalties by category
        const penaltyGroups: Record<string, { count: number; total: number }> = {};
        for (const p of b.penalties.mealPenalties) {
          if (!penaltyGroups[p.meal]) penaltyGroups[p.meal] = { count: 0, total: 0 };
          penaltyGroups[p.meal].count++;
          penaltyGroups[p.meal].total += p.amount;
        }
        const segmentTotal = b.segments.reduce((s, seg) => s + seg.subtotal, 0);
        const dailyMin = b.adjustedBaseRate * (b.dayMultiplier?.multiplier ?? 1);
        const appliedSegmentTotal = Math.max(segmentTotal, dailyMin);
        const mealPenaltyTotal = b.penalties.mealPenalties.reduce((s, p) => s + p.amount, 0);
        // Build grand total addends
        const addends: string[] = [`$${appliedSegmentTotal.toFixed(2)}`];
        if (mealPenaltyTotal > 0) addends.push(`$${mealPenaltyTotal.toFixed(2)}`);
        if (b.penalties.forcedCallPenalty > 0) addends.push(`$${b.penalties.forcedCallPenalty.toFixed(2)}`);

        return (
          <div className="mt-4 p-3 rounded bg-muted/50 text-sm font-mono space-y-1">
            <div className="font-semibold mb-2">Breakdown:</div>
            <div>Hourly: (${b.baseRate.toFixed(2)} base + ${tc.input.stuntAdjustment.toFixed(2)} adj) / 8 = ${b.adjustedHourlyRate.toFixed(2)}/hr</div>
            <div>Net work hours: {b.netWorkHours}h</div>
            {b.segments.map((s, i) => (
              <div key={i}>
                {s.label}: {s.hours}h × ${s.rate.toFixed(2)} × {s.multiplier}x = ${s.subtotal.toFixed(2)}
              </div>
            ))}
            {segmentTotal < dailyMin && (
              <div>8hr minimum guarantee: ${dailyMin.toFixed(2)}</div>
            )}
            {Object.keys(penaltyGroups).length > 0 ? (
              Object.entries(penaltyGroups).map(([meal, g]) => (
                <div key={meal}>
                  {meal} penalties: {g.count} × 30min = ${g.total.toFixed(2)}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">Meal penalties: none</div>
            )}
            {b.penalties.forcedCallPenalty > 0 && (
              <div>Forced call: ${b.penalties.forcedCallPenalty.toFixed(2)}</div>
            )}
            {b.dayMultiplier.applied && (
              <div>Day multiplier: {b.dayMultiplier.type} ({b.dayMultiplier.multiplier}x)</div>
            )}
            <div className="font-bold mt-1">
              Grand Total: {addends.length > 1 ? addends.join(" + ") + " = " : ""}${b.grandTotal.toFixed(2)}
            </div>
          </div>
        );
      })()}

      {tc.error && (
        <div className="mt-4 p-3 rounded bg-red-900/20 text-red-400 text-sm">
          Error: {tc.error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={label}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <Label htmlFor={label} className="cursor-pointer">
        {label}
      </Label>
    </div>
  );
}
