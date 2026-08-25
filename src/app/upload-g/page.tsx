"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Grid3x3,
  List,
  RotateCw,
  Trash2,
  Upload,
  Camera,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface GUpload {
  _id: string;
  title: string;
  displayTitle: string;
  originalName: string;
  contentType: string;
  size: number;
  rotation: number;
  path: string;
  transcription: unknown | null;
  createdAt: string;
}

type ViewMode = "grid" | "list";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadGPage() {
  const [uploads, setUploads] = useState<GUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Remember the user's last view choice.
  useEffect(() => {
    const saved = window.localStorage.getItem("stl_g_view");
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  const chooseView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem("stl_g_view", next);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/g-uploads");
      if (!res.ok) throw new Error("Failed to load uploads");
      const data = (await res.json()) as { uploads: GUpload[] };
      setUploads(data.uploads);
    } catch {
      toast.error("Couldn't load your Exhibit Gs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const usable = files.filter(
        (f) => f.type.startsWith("image/") || f.type === "application/pdf" || /\.(hei[cf])$/i.test(f.name)
      );
      if (usable.length === 0) {
        toast.error("Only images or PDFs can be uploaded");
        return;
      }

      setUploading(true);
      try {
        const form = new FormData();
        for (const file of usable) form.append("file", file);

        const res = await fetch("/api/g-uploads", {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          created?: GUpload[];
          duplicates?: Array<{ originalName: string }>;
          error?: string;
        };

        if (!res.ok) throw new Error(data.error || "Upload failed");

        const added = data.created?.length ?? 0;
        const dupes = data.duplicates?.length ?? 0;

        if (added > 0) {
          toast.success(`Uploaded ${added} file${added === 1 ? "" : "s"}`);
        }
        if (dupes > 0) {
          const names = (data.duplicates ?? [])
            .map((d) => d.originalName)
            .join(", ");
          toast.warning(
            `Already uploaded, skipped: ${names}`,
            { duration: 6000 }
          );
        }
        await load();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Upload failed"
        );
      } finally {
        setUploading(false);
      }
    },
    [load]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  };

  const rotate = async (upload: GUpload) => {
    const rotation = (upload.rotation + 90) % 360;
    setUploads((prev) =>
      prev.map((u) => (u._id === upload._id ? { ...u, rotation } : u))
    );
    try {
      const res = await fetch(`/api/g-uploads/${upload._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotation }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't save the rotation");
      await load();
    }
  };

  const saveTitle = async (id: string) => {
    const title = editingTitle.trim();
    setEditingId(null);
    try {
      const res = await fetch(`/api/g-uploads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json()) as GUpload;
      setUploads((prev) => prev.map((u) => (u._id === id ? updated : u)));
    } catch {
      toast.error("Couldn't rename");
      await load();
    }
  };

  const remove = async (upload: GUpload) => {
    if (!window.confirm(`Delete "${upload.displayTitle}"?`)) return;
    try {
      const res = await fetch(`/api/g-uploads/${upload._id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setUploads((prev) => prev.filter((u) => u._id !== upload._id));
      toast.success("Deleted");
    } catch {
      toast.error("Couldn't delete");
    }
  };

  const isPdf = (u: GUpload) => u.contentType === "application/pdf";

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Upload a G</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Exhibit Gs, call sheets and timecards. Tap one to transcribe it.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => chooseView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={`p-2 ${view === "grid" ? "bg-accent" : "hover:bg-accent/50"}`}
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => chooseView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={`p-2 ${view === "list" ? "bg-accent" : "hover:bg-accent/50"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <Button
            variant="outline"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-4 w-4 mr-2" />
            Camera
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors mb-8 ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/40"
        }`}
      >
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium">Drag and drop your Exhibit Gs here</p>
        <p className="text-sm text-muted-foreground mt-1">
          Or use Upload to browse, or Camera to shoot one on your phone.
          Duplicates are detected automatically.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Loading…</p>
      ) : uploads.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No Exhibit Gs yet — add your first one above.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {uploads.map((u) => (
            <Card key={u._id} className="overflow-hidden p-0 gap-0">
              <Link
                href={`/upload-g/${u._id}`}
                className="block bg-muted/40 h-44 overflow-hidden relative"
              >
                {isPdf(u) ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.path}
                    alt={u.displayTitle}
                    className="w-full h-full object-cover transition-transform"
                    style={{ transform: `rotate(${u.rotation}deg)` }}
                  />
                )}
              </Link>

              <div className="p-3 space-y-2">
                {editingId === u._id ? (
                  <Input
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => saveTitle(u._id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle(u._id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(u._id);
                      setEditingTitle(u.title);
                    }}
                    className="text-sm font-medium truncate w-full text-left hover:underline"
                    title="Click to rename"
                  >
                    {u.displayTitle}
                  </button>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatSize(u.size)}
                    {u.transcription ? " · transcribed" : ""}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => rotate(u)}
                      aria-label="Rotate"
                      className="p-1.5 rounded hover:bg-accent"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(u)}
                      aria-label="Delete"
                      className="p-1.5 rounded hover:bg-accent text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-border p-0">
          {uploads.map((u) => (
            <div key={u._id} className="flex items-center gap-4 p-3">
              <Link
                href={`/upload-g/${u._id}`}
                className="h-14 w-14 shrink-0 rounded bg-muted/40 overflow-hidden relative"
              >
                {isPdf(u) ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.path}
                    alt={u.displayTitle}
                    className="w-full h-full object-cover"
                    style={{ transform: `rotate(${u.rotation}deg)` }}
                  />
                )}
              </Link>

              <div className="flex-1 min-w-0">
                {editingId === u._id ? (
                  <Input
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => saveTitle(u._id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle(u._id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 text-sm max-w-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(u._id);
                      setEditingTitle(u.title);
                    }}
                    className="font-medium truncate block max-w-full text-left hover:underline"
                    title="Click to rename"
                  >
                    {u.displayTitle}
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()} ·{" "}
                  {formatSize(u.size)}
                  {u.transcription ? " · transcribed" : ""}
                </p>
              </div>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => rotate(u)}
                  aria-label="Rotate"
                  className="p-2 rounded hover:bg-accent"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(u)}
                  aria-label="Delete"
                  className="p-2 rounded hover:bg-accent text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
