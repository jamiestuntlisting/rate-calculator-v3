"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/time-utils";
import { toast } from "sonner";
import { Upload, FileText, Loader2 } from "lucide-react";

interface ResidualImportSummary {
  _id: string;
  performerName: string;
  filename: string;
  totalChecks: number;
  totalGross: number;
  createdAt: string;
}

interface ProductionSummary {
  title: string;
  totalGross: number;
  totalNet: number;
  checkCount: number;
  firstCheckDate: string;
  lastCheckDate: string;
  companies: string[];
}

interface ImportDetail {
  _id: string;
  performerName: string;
  filename: string;
  totalChecks: number;
  totalGross: number;
  createdAt: string;
  productions: ProductionSummary[];
}

export default function ResidualsPage() {
  const router = useRouter();
  const [imports, setImports] = useState<ResidualImportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Active import detail
  const [activeImport, setActiveImport] = useState<ImportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Search/filter
  const [searchShow, setSearchShow] = useState("");

  const fetchImports = useCallback(async () => {
    try {
      const res = await fetch("/api/residuals");
      if (res.ok) {
        const data = await res.json();
        setImports(data.imports || []);

        // Auto-load the most recent import if available
        if (data.imports?.length > 0 && !activeImport) {
          loadImportDetail(data.imports[0]._id);
        }
      }
    } catch {
      console.error("Failed to fetch imports");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadImportDetail = async (importId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/residuals/${importId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveImport(data);
      }
    } catch {
      toast.error("Failed to load import details");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input
    e.target.value = "";

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    setUploading(true);
    setProcessing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/residuals", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to import CSV");
      }

      const data = await res.json();
      toast.success(
        `Imported ${data.totalChecks} residual checks for ${data.performerName}!`
      );

      // Refresh and load the new import
      await fetchImports();
      if (data._id) {
        await loadImportDetail(data._id);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to import CSV"
      );
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  // Filter productions if search is active
  const filteredProductions = activeImport?.productions.filter((p) =>
    searchShow
      ? p.title.toLowerCase().includes(searchShow.toLowerCase())
      : true
  );

  // Summary stats
  const totalGross = activeImport?.totalGross || 0;
  const totalProductions = activeImport?.productions.length || 0;
  const totalChecks = activeImport?.totalChecks || 0;

  // No imports yet — show tutorial + upload
  if (!loading && imports.length === 0 && !processing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Residuals Tracker</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              How to Get Your Residuals CSV from SAG-AFTRA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full p-0">1</Badge>
                <p>Go to <span className="text-primary font-medium">sagaftra.org</span> and log in to your account.</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full p-0">2</Badge>
                <p>Click on the <span className="text-primary font-medium">Residual Tracker</span> in your member portal.</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full p-0">3</Badge>
                <p>Set the <span className="text-primary font-medium">Time Frame</span> from <strong>1/1/1900</strong> until <strong>today</strong> to capture your full history.</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full p-0">4</Badge>
                <p>Click the <span className="text-primary font-medium">Export Results</span> button, then click <strong>&quot;Yes, Export Data&quot;</strong>.</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full p-0">5</Badge>
                <p>The website may take <span className="text-primary font-medium">several minutes</span> to process depending on the length of your career. You may need to click the button a few times for it to fully process.</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full p-0">6</Badge>
                <p>When prompted, <span className="text-primary font-medium">save the CSV file</span> to your computer.</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary" className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full p-0">7</Badge>
                <p>Click <span className="text-primary font-medium">Import CSV</span> below to upload that file. It will take a few minutes for us to process the data.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <div>
                <p className="font-semibold">Ready to import?</p>
                <p className="text-sm text-muted-foreground">
                  Upload your SAG-AFTRA residuals CSV file
                </p>
              </div>
              <Button asChild size="lg">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </label>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Processing state
  if (processing) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Residuals Tracker</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4 py-12">
              <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
              <div>
                <p className="font-semibold text-lg">Processing...</p>
                <p className="text-sm text-muted-foreground">
                  Please give us a few minutes to process your residuals data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Main view — show import data
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Residuals Tracker</h1>
          {activeImport && (
            <p className="text-sm text-muted-foreground mt-1">
              {activeImport.performerName} &middot; {activeImport.filename}
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <label className="cursor-pointer">
            <Upload className="mr-2 h-4 w-4" />
            Upload New CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Gross</p>
            <p className="text-2xl font-bold">{formatCurrency(totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Productions</p>
            <p className="text-2xl font-bold">{totalProductions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Checks</p>
            <p className="text-2xl font-bold">{totalChecks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Avg / Production</p>
            <p className="text-2xl font-bold">
              {totalProductions > 0
                ? formatCurrency(totalGross / totalProductions)
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div>
        <Input
          placeholder="Search by production title..."
          value={searchShow}
          onChange={(e) => setSearchShow(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Productions Table */}
      {loadingDetail ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
              <p className="text-muted-foreground mt-2">Loading details...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Production / Episode</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Checks</TableHead>
                    <TableHead className="hidden md:table-cell">First Check</TableHead>
                    <TableHead className="hidden md:table-cell">Last Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProductions && filteredProductions.length > 0 ? (
                    filteredProductions.map((prod) => (
                      <TableRow
                        key={prod.title}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          router.push(
                            `/residuals/${activeImport!._id}?title=${encodeURIComponent(prod.title)}`
                          )
                        }
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{prod.title}</p>
                            {prod.companies.length > 0 && (
                              <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                                {prod.companies.join(", ")}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(prod.totalGross)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {prod.checkCount}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {prod.firstCheckDate || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {prod.lastCheckDate || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-8"
                      >
                        {searchShow
                          ? "No productions match your search"
                          : "No production data"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
