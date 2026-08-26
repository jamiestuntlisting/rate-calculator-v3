"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

export default function ResidualsUploadPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Residual statements come as a CSV file");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/residuals", { method: "POST", body: form });
      const data = (await res.json()) as {
        _id?: string;
        totalChecks?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Import failed");

      toast.success(`Imported ${data.totalChecks ?? 0} checks`);
      router.push(data._id ? `/residuals/${data._id}` : "/residuals");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Upload Residuals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import a residual statement exported from SAG-AFTRA.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) upload(file);
            }}
            className={`rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/40"
            }`}
          >
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Drop your residuals CSV here</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Every check in the file is imported and grouped by production.
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {uploading ? "Importing…" : "Choose a file"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Where to get the file</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p className="flex gap-2">
            <FileText className="h-4 w-4 shrink-0 mt-0.5" />
            Sign in to sagaftra.org, open your residuals statements, and export
            them as CSV. The file lists one row per check.
          </p>
          <p>
            Importing the same statement twice adds a second copy — delete the
            older import from the Residuals page if that happens.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
