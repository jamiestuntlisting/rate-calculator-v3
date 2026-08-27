"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Plus, RotateCw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { WorkDocument } from "@/types";

const ACCEPT = "image/*,application/pdf";

/** What the uploads route will take. */
function isSupported(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

function isImage(doc: WorkDocument): boolean {
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(doc.filename);
}

interface ExhibitGDropzoneProps {
  documents: WorkDocument[];
  onUpload: (doc: WorkDocument) => void;
  onRemove: (index: number) => void;
  /** Turn a page that came in sideways. Quarter turns clockwise. */
  onRotate?: (index: number, rotation: number) => void;
  disabled?: boolean;
}

/**
 * The way an Exhibit G gets into the app.
 *
 * Deliberately the largest thing on the calculator: a transcribed G is worth
 * far more than a hand-typed day, so the upload leads and everything else
 * describes it. Drag-and-drop is the desktop path; on a phone the same area
 * is a tap target and the camera button goes straight to the shot people are
 * already taking on set.
 */
export function ExhibitGDropzone({
  documents,
  onUpload,
  onRemove,
  onRotate,
  disabled = false,
}: ExhibitGDropzoneProps) {
  const browseRef = useRef<HTMLInputElement>(null);
  /** Nested children fire their own dragleave, so count instead of toggling. */
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);

  const busy = disabled || uploading > 0;

  const send = async (files: File[]) => {
    const usable = files.filter(isSupported);
    if (usable.length < files.length) {
      toast.error("Only photos and PDFs, please");
    }
    if (!usable.length) return;

    setUploading(usable.length);
    let done = 0;
    for (const file of usable) {
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body });
        if (!res.ok) throw new Error();
        const { filename } = (await res.json()) as { filename: string };
        onUpload({
          filename,
          originalName: file.name,
          documentType: "exhibit_g",
          uploadedAt: new Date().toISOString(),
        });
        done++;
      } catch {
        toast.error(`Couldn't upload ${file.name}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (done) {
      toast.success(done === 1 ? "Exhibit G added" : `${done} pages added`);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;
    send(Array.from(e.dataTransfer.files));
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Read synchronously: React clears currentTarget before the async work.
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length) send(files);
  };

  const browse = () => {
    if (!busy) browseRef.current?.click();
  };

  const dragHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop,
  };

  return (
    // Dropping works over the whole area, so a second page can still be
    // dragged in once the big target has made way for the pages themselves.
    <div className="space-y-3" {...dragHandlers}>
      <input
        ref={browseRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onPick}
        disabled={busy}
      />

      {documents.length === 0 ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Add your Exhibit G"
          aria-disabled={busy}
          onClick={browse}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              browse();
            }
          }}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            dragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/60 hover:bg-accent/30"
          } ${busy ? "pointer-events-none opacity-70" : ""}`}
        >
          {uploading > 0 ? (
            <>
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-base font-medium">
                Uploading{uploading > 1 ? ` ${uploading} pages` : ""}…
              </p>
            </>
          ) : (
            <>
              <div className="rounded-full bg-primary/10 p-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold">
                  {dragging ? "Drop it here" : "Drop your Exhibit G here"}
                </p>
                <p className="text-sm text-muted-foreground">
                  or tap to choose a photo or PDF
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        /* The big target has done its job — the pages take its place, and
           another one is added from the tile beside them. */
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-lg transition-colors ${
            dragging ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
          }`}
        >
          {documents.map((doc, index) => {
            const rotation = doc.rotation ?? 0;
            return (
              <div
                key={`${doc.filename}-${index}`}
                className="relative rounded-lg border border-border/60 overflow-hidden bg-muted"
              >
                {/* The turn happens after layout, so a quarter-turned page
                    paints taller than its slot. Clipping it here keeps it off
                    the filename underneath. */}
                <div className="h-24 overflow-hidden flex items-center justify-center">
                  {isImage(doc) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/uploads/${doc.filename}`}
                      alt={doc.originalName}
                      style={{ transform: `rotate(${rotation}deg)` }}
                      className="w-full h-24 object-cover transition-transform"
                    />
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <p className="text-[11px] truncate px-2 py-1 bg-background/80">
                  {doc.originalName}
                </p>
                {!disabled && (
                  <div className="absolute top-1 right-1 flex gap-1">
                    {onRotate && isImage(doc) && (
                      <button
                        type="button"
                        onClick={() => onRotate(index, (rotation + 90) % 360)}
                        aria-label={`Rotate ${doc.originalName}`}
                        className="rounded-full bg-background/90 border border-border p-1 text-muted-foreground hover:text-foreground"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      aria-label={`Remove ${doc.originalName}`}
                      className="rounded-full bg-background/90 border border-border p-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            disabled={busy}
            onClick={browse}
            className="flex min-h-[7.75rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary/60 hover:text-foreground disabled:opacity-50"
          >
            {uploading > 0 ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
            <span className="px-2 text-center leading-tight">
              {uploading > 0 ? "Uploading…" : "Add another page"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
