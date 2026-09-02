"use client";

import { isUploadable } from "@/lib/uploadable";
import { toUploadableImage } from "@/lib/heic-to-jpeg";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { shortDay } from "@/lib/format-date";
import { UPLOAD_KINDS, UPLOAD_KIND_LABELS, type UploadKind } from "@/lib/upload-kind";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Grid3x3,
  List,
  RotateCw,
  Trash2,
  Upload,
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
  /** Set when the member declared the transcription finished. */
  transcribedAt?: string | null;
  /** exhibit_g | call_sheet | other — only an Exhibit G is transcribed. */
  kind?: string;
  createdAt: string;
}

/** The kind an upload is, older rows counting as Exhibit Gs. */
const kindOf = (u: { kind?: string }): UploadKind =>
  (UPLOAD_KINDS as readonly string[]).includes(u.kind ?? "")
    ? (u.kind as UploadKind)
    : "exhibit_g";

/**
 * The reclassify pulldown: what this file is. The same control on the
 * pile's cards, its tables and the day's Photos & Documents — and
 * deliberately not in the transcription view.
 */
function KindSelect({
  value,
  onChange,
  id,
}: {
  value: UploadKind;
  onChange: (kind: UploadKind) => void;
  id: string;
}) {
  return (
    <select
      id={id}
      aria-label="What this file is"
      value={value}
      onChange={(e) => onChange(e.target.value as UploadKind)}
      onClick={(e) => e.stopPropagation()}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
    >
      {UPLOAD_KINDS.map((k) => (
        <option key={k} value={k}>
          {UPLOAD_KIND_LABELS[k]}
        </option>
      ))}
    </select>
  );
}

/** What a finished transcription says about its day, for the table. */
function transcribedFacts(u: GUpload): { workDate: string; character: string } {
  const t = u.transcription as {
    details?: { workDate?: string };
    rows?: Array<{ character?: string }>;
  } | null;
  return {
    workDate: t?.details?.workDate || "",
    character: t?.rows?.[0]?.character || "",
  };
}

/** Finished beats started: the label says which one this G actually is. */
const transcriptionLabel = (u: {
  transcription: unknown | null;
  transcribedAt?: string | null;
}) =>
  u.transcribedAt
    ? " · transcribed ✓"
    : u.transcription
      ? " · in progress"
      : "";

type ViewMode = "grid" | "list";

/** 8/14/26 — the way a work date gets written on set. */
function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

export default function UploadGPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<GUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Type first, extension second — the same rule the server applies,
      // so a JPEG with a blank type still counts as a JPEG.
      const usable = files.filter((f) => isUploadable(f.type, f.name));
      if (usable.length === 0) {
        toast.error("Only images or PDFs can be uploaded");
        return;
      }

      if (usable.length < files.length) {
        toast.warning(
          `${files.length - usable.length} file${files.length - usable.length === 1 ? "" : "s"} skipped — not a photo or PDF`
        );
      }
      setUploading(true);
      try {
        // Chunked: one giant request full of phone JPEGs can exceed the
        // platform's request size limit and die without a useful error.
        const MAX_CHUNK_FILES = 4;
        const MAX_CHUNK_BYTES = 24 * 1024 * 1024;
        let added = 0;
        let dupes = 0;
        const dupeNames: string[] = [];
        let queue: File[] = [];
        let queueBytes = 0;
        const flush = async () => {
          if (queue.length === 0) return;
          const form = new FormData();
          for (const file of queue) form.append("file", file);
          queue = [];
          queueBytes = 0;
          const res = await fetch("/api/g-uploads", { method: "POST", body: form });
          const data = (await res.json()) as {
            created?: GUpload[];
            duplicates?: Array<{ originalName: string }>;
            error?: string;
          };
          if (!res.ok) throw new Error(data.error || "Upload failed");
          added += data.created?.length ?? 0;
          dupes += data.duplicates?.length ?? 0;
          for (const d of data.duplicates ?? []) dupeNames.push(d.originalName);
        };
        for (const original of usable) {
          // An iPhone HEIC becomes a JPEG here, so the preview can draw it.
          const file = await toUploadableImage(original);
          if (
            queue.length >= MAX_CHUNK_FILES ||
            (queueBytes + file.size > MAX_CHUNK_BYTES && queue.length > 0)
          ) {
            await flush();
          }
          queue.push(file);
          queueBytes += file.size;
        }
        await flush();

        if (added > 0) {
          toast.success(`Uploaded ${added} file${added === 1 ? "" : "s"}`);
        }
        if (dupes > 0) {
          toast.warning(
            `Already uploaded, skipped: ${dupeNames.join(", ")}`,
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

  /**
   * Reclassify a file. The server retypes the day's document with it,
   * so an Exhibit G made a call sheet leaves the pile and the day keeps
   * it as its call sheet, and the other way round.
   */
  const reclassify = async (upload: GUpload, kind: UploadKind) => {
    const before = upload.kind;
    setUploads((prev) => prev.map((u) => (u._id === upload._id ? { ...u, kind } : u)));
    try {
      const res = await fetch(`/api/g-uploads/${upload._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(`Now a${kind === "exhibit_g" ? "n" : ""} ${UPLOAD_KIND_LABELS[kind].toLowerCase()}`);
    } catch {
      setUploads((prev) => prev.map((u) => (u._id === upload._id ? { ...u, kind: before } : u)));
      toast.error("Couldn't change what this file is");
    }
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

  // The page is a to-do list; the number on the title is how long it
  // still is. Zero shows no badge — the empty pile says it better.
  // Only an Exhibit G is a to-do; call sheets and other files ride along.
  const todoCount = uploads.filter(
    (u) => !u.transcribedAt && kindOf(u) === "exhibit_g"
  ).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            Transcribe
            {!loading && todoCount > 0 && (
              <span
                aria-label={`${todoCount} to transcribe`}
                className="rounded-full bg-accent px-3 py-0.5 text-lg font-semibold tabular-nums"
              >
                {todoCount}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Exhibit Gs, call sheets and timecards. Tap one to transcribe it.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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

          <Button asChild>
            {/* The green action: straight to the page that can actually
                request the help — it asks us to transcribe and explains
                what it costs. */}
            <Link href="/get-started">Need help transcribing?</Link>
          </Button>
          {/* One Upload, straight to the photo library / file picker —
              the separate camera path photographed one frame at a time
              and nobody wants that. */}
          <Button
            variant="outline"
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

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Loading…</p>
      ) : uploads.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No Exhibit Gs yet — add your first one above.
        </p>
      ) : (
        (() => {
          // A to-do list only lists the to-dos: finished cards drop to
          // their own section at the bottom, out of the pile.
          const todo = uploads.filter(
            (u) => !u.transcribedAt && kindOf(u) === "exhibit_g"
          );
          const done = uploads.filter((u) => u.transcribedAt);
          const files = uploads.filter(
            (u) => !u.transcribedAt && kindOf(u) !== "exhibit_g"
          );
          const section = (items: GUpload[]) =>
            view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((u) => (
            <Card key={u._id} className="overflow-hidden p-0 gap-0">
              <Link
                href={`/upload-g/${u._id}`}
                className="block bg-muted/40 h-72 sm:h-80 overflow-hidden relative"
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
                    className="w-full h-full object-contain transition-transform"
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

                {/* Rotate is used often and delete is destructive, so they sit
                    at opposite ends with the metadata between them. */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => rotate(u)}
                    aria-label="Rotate"
                    title="Rotate"
                    className="h-12 w-12 shrink-0 flex items-center justify-center rounded-lg border border-border hover:bg-accent active:scale-95 transition"
                  >
                    <RotateCw className="h-6 w-6" />
                  </button>

                  <span className="flex min-w-0 flex-col items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate">
                      {formatUploadDate(u.createdAt)}
                      {transcriptionLabel(u)}
                    </span>
                    <KindSelect
                      id={`kind-${u._id}`}
                      value={kindOf(u)}
                      onChange={(k) => reclassify(u, k)}
                    />
                  </span>

                  <button
                    type="button"
                    onClick={() => remove(u)}
                    aria-label="Delete"
                    title="Delete"
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-border p-0">
          {items.map((u) => (
            <div key={u._id} className="flex items-center gap-3 p-3">
              <Link
                href={`/upload-g/${u._id}`}
                className="h-24 w-24 sm:h-40 sm:w-40 shrink-0 rounded bg-muted/40 overflow-hidden relative"
              >
                {isPdf(u) ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <FileText className="h-16 w-16 text-muted-foreground" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.path}
                    alt={u.displayTitle}
                    className="w-full h-full object-contain"
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
                <p className="text-sm text-muted-foreground">
                  Uploaded {formatUploadDate(u.createdAt)}
                  {transcriptionLabel(u)}
                </p>
                <div className="mt-1">
                  <KindSelect
                    id={`kind-list-${u._id}`}
                    value={kindOf(u)}
                    onChange={(k) => reclassify(u, k)}
                  />
                </div>
              </div>

              {/* Stacked controls take 36px of width instead of 100 —
                  on a phone that width is the title's. */}
              <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => rotate(u)}
                aria-label="Rotate"
                title="Rotate"
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border hover:bg-accent active:scale-95 transition"
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(u)}
                aria-label="Delete"
                title="Delete"
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              </div>
            </div>
          ))}
        </Card>
            );
          return (
            <>
              {todo.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nothing waiting to be transcribed — the pile is clear.
                </p>
              ) : (
                section(todo)
              )}
              {files.length > 0 && (
                <div className="mt-10 space-y-3">
                  <div>
                    <h2 className="text-xl font-semibold">Other files</h2>
                    <p className="text-sm text-muted-foreground">
                      Call sheets, contracts, pay stubs, wardrobe and other
                      photos, conversations with production. Each started a
                      work day and rides along on it; nothing to transcribe.
                      Change what a file is if it came in wrong.
                    </p>
                  </div>
                  <Card className="p-0 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14" />
                          <TableHead>File</TableHead>
                          <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
                          <TableHead className="w-28">Kind</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {files.map((u) => (
                          <TableRow key={u._id}>
                            <TableCell className="py-2">
                              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
                                {isPdf(u) ? (
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={u.path}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    style={{ transform: `rotate(${u.rotation}deg)` }}
                                  />
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[7rem] sm:max-w-none">
                              <a
                                href={u.path}
                                target="_blank"
                                rel="noreferrer"
                                className="block truncate font-medium underline-offset-2 hover:underline"
                              >
                                {u.displayTitle}
                              </a>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell whitespace-nowrap">
                              {formatUploadDate(u.createdAt)}
                            </TableCell>
                            <TableCell className="py-2">
                              <KindSelect
                                id={`kind-file-${u._id}`}
                                value={kindOf(u)}
                                onChange={(k) => reclassify(u, k)}
                              />
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <button
                                type="button"
                                onClick={() => remove(u)}
                                aria-label="Delete"
                                title="Delete"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              )}
              {done.length > 0 && (
                <div className="mt-10 space-y-3">
                  <div>
                    <h2 className="text-xl font-semibold">Transcribed ✓</h2>
                    <p className="text-sm text-muted-foreground">
                      Out of the pile. Tap a row to review it — reopen it
                      from inside if something needs correcting.
                    </p>
                  </div>
                  {/* Finished Gs are records now, not a pile: a table
                      like the tracker's, a thumbnail for the card, the
                      day it was for, and the day it was finished. */}
                  <Card className="p-0 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14" />
                          <TableHead>Show</TableHead>
                          <TableHead>Work date</TableHead>
                          <TableHead className="hidden md:table-cell">
                            Transcribed
                          </TableHead>
                          <TableHead className="w-28">File</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {done.map((u) => {
                          const facts = transcribedFacts(u);
                          return (
                            <TableRow
                              key={u._id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => router.push(`/upload-g/${u._id}`)}
                            >
                              <TableCell className="py-2">
                                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
                                  {isPdf(u) ? (
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={u.path}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      style={{ transform: `rotate(${u.rotation}deg)` }}
                                    />
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="max-w-[7rem] sm:max-w-none">
                                <span className="block truncate font-medium">
                                  {u.displayTitle}
                                </span>
                                {facts.character && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {facts.character}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {facts.workDate
                                  ? shortDay(facts.workDate)
                                  : formatUploadDate(u.createdAt)}
                              </TableCell>
                              <TableCell className="hidden md:table-cell whitespace-nowrap text-muted-foreground">
                                {u.transcribedAt
                                  ? `${formatUploadDate(u.transcribedAt)} ✓`
                                  : ""}
                              </TableCell>
                              <TableCell className="py-2">
                                <KindSelect
                                  id={`kind-done-${u._id}`}
                                  value={kindOf(u)}
                                  onChange={(k) => reclassify(u, k)}
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    remove(u);
                                  }}
                                  aria-label="Delete"
                                  title="Delete"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
