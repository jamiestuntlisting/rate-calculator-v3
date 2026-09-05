"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { isUploadable } from "@/lib/uploadable";
import { toUploadableImage } from "@/lib/heic-to-jpeg";
import { useThumbnails } from "@/lib/use-thumbnails";
import { shortDay } from "@/lib/format-date";

/**
 * One audit, walked in steps: details, the Exhibit Gs, transcription
 * (with a review of done and to-do, forking to transcribing or to
 * matching paychecks), pricing every day, matching paychecks, and the
 * package. Steps 4 and 5 are placeholders with the shape of what they
 * will show; the package is a sample PDF built from the cards so far.
 */
interface Audit {
  _id: string;
  showName: string;
  performers: string;
  notes: string;
  status: string;
  createdAt: string;
}

interface AuditCard {
  _id: string;
  displayTitle: string;
  originalName: string;
  path: string;
  thumbPath?: string | null;
  contentType: string;
  rotation: number;
  transcription: { details?: { workDate?: string; showName?: string }; rows?: Array<Record<string, string>> } | null;
  transcribedAt: string | null;
}

const STEPS = ["Details", "Exhibit Gs", "Transcribe", "Price every day", "Match paychecks", "Package"];

export default function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const step = Math.min(6, Math.max(1, Number(search.get("step") ?? "1") || 1));
  const [audit, setAudit] = useState<Audit | null>(null);
  const [cards, setCards] = useState<AuditCard[]>([]);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useThumbnails(cards, (cid, thumbPath) =>
    setCards((prev) => prev.map((c) => (c._id === cid ? { ...c, thumbPath } : c)))
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/audits/${id}`);
    if (!res.ok) {
      setMissing(true);
      return;
    }
    const data = (await res.json()) as { audit: Audit; uploads: AuditCard[] };
    setAudit(data.audit);
    setCards(data.uploads);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !(user.role === "admin" || isAdminEmail(user.email))) {
    return <div className="max-w-4xl mx-auto px-4 py-10 text-sm text-muted-foreground">Admin access required.</div>;
  }
  if (missing) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 text-sm text-muted-foreground">
        That audit was not found. <Link href="/admin/audits" className="underline">Audits</Link>
      </div>
    );
  }
  if (!audit) return <div className="max-w-4xl mx-auto px-4 py-10 text-sm text-muted-foreground">Loading…</div>;

  const go = (n: number) => router.push(`/admin/audits/${id}?step=${n}`);

  const saveDetails = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/audits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showName: audit.showName, performers: audit.performers, notes: audit.notes }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Saved");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    const usable = files.filter((f) => isUploadable(f.type, f.name));
    if (usable.length === 0) {
      toast.error("Only photos or PDFs can be uploaded");
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: usable.length, name: usable[0].name });
    let added = 0;
    let dupes = 0;
    const failed: string[] = [];
    try {
      for (let i = 0; i < usable.length; i++) {
        const original = usable[i];
        setProgress((p) => (p ? { ...p, name: original.name } : p));
        try {
          const form = new FormData();
          form.append("file", await toUploadableImage(original));
          const res = await fetch(`/api/admin/audits/${id}/uploads`, { method: "POST", body: form });
          const data = (await res.json().catch(() => ({}))) as { created?: AuditCard[]; duplicates?: unknown[]; error?: string };
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          added += data.created?.length ?? 0;
          dupes += data.duplicates?.length ?? 0;
          if (data.created?.length) {
            const fresh = data.created;
            setCards((prev) => [...prev.filter((c) => !fresh.some((f) => f._id === c._id)), ...fresh]);
          }
        } catch (e) {
          console.error("audit upload failed:", original.name, e);
          failed.push(original.name);
        }
        setProgress((p) => (p ? { ...p, done: i + 1 } : p));
      }
      if (added) toast.success(`${added} card${added === 1 ? "" : "s"} in`);
      if (dupes) toast.warning(`${dupes} already in this audit, skipped`);
      if (failed.length) toast.error(`${failed.length} didn't upload: ${failed.join(", ")}`, { duration: 8000 });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const done = cards.filter((c) => c.transcribedAt);
  const todo = cards.filter((c) => !c.transcribedAt);
  const performerOf = (c: AuditCard) => (c.transcription?.rows?.[0]?.performer || "").trim();
  const back = encodeURIComponent(`/admin/audits/${id}?step=3`);

  const Placeholder = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{children}</div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-5">
      <div>
        <Link href="/admin/audits" className="text-sm text-muted-foreground hover:underline">← Audits</Link>
        <h1 className="text-2xl font-bold">{audit.showName}</h1>
        <p className="text-sm text-muted-foreground">
          {cards.length} card{cards.length === 1 ? "" : "s"} · {done.length} transcribed · opened {shortDay(audit.createdAt.slice(0, 10))}
        </p>
      </div>

      {/* The steps, as chips; the current one filled. */}
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => go(i + 1)}
              className={`rounded-full border px-3 py-1 text-xs ${
                step === i + 1 ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="a-show">Show title</Label>
              <Input id="a-show" value={audit.showName} onChange={(e) => setAudit({ ...audit, showName: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-performers">Performers involved</Label>
              <Textarea id="a-performers" value={audit.performers} onChange={(e) => setAudit({ ...audit, performers: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-notes">Note</Label>
              <Textarea id="a-notes" value={audit.notes} onChange={(e) => setAudit({ ...audit, notes: e.target.value })} rows={3} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void saveDetails()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button onClick={() => go(2)}>Next: Exhibit Gs</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Exhibit Gs</CardTitle>
            <p className="text-xs text-muted-foreground">Every card from the run. Duplicates are skipped.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void uploadFiles(files);
              }}
            />
            <Button className="w-full" size="lg" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Add Exhibit Gs"}
            </Button>
            {progress && (
              <div className="space-y-1" data-testid="audit-progress">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                </div>
                <p className="text-sm"><span className="font-semibold tabular-nums">{progress.done}</span> of {progress.total} uploaded — now {progress.name}</p>
              </div>
            )}
            {cards.length > 0 && (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8" data-testid="audit-cards">
                {cards.map((c) => (
                  <Link key={c._id} href={`/upload-g/${c._id}?back=${back}`} className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-muted/40" title={c.displayTitle}>
                    {c.contentType === "application/pdf" ? (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground"><FileText className="h-6 w-6" /></span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbPath ?? c.path} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" style={{ transform: `rotate(${c.rotation}deg)` }} />
                    )}
                    {c.transcribedAt && <span className="absolute right-1 top-1 rounded-full bg-emerald-600 p-0.5 text-white"><Check className="h-3 w-3" /></span>}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => go(3)} disabled={cards.length === 0}>Next: transcribe</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transcribe</CardTitle>
              <p className="text-xs text-muted-foreground">
                {done.length} done · {todo.length} to go. Each card opens in the transcription view and comes back here.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {todo.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {todo.map((c, i) => (
                    <Link key={c._id} href={`/upload-g/${c._id}?back=${back}`} className="flex items-center gap-3 py-2 hover:bg-accent/40">
                      <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
                        {c.contentType === "application/pdf" ? <FileText className="h-6 w-6 text-muted-foreground" /> : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumbPath ?? c.path} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" style={{ transform: `rotate(${c.rotation}deg)` }} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{c.displayTitle}</span>
                      <span className="text-xs text-muted-foreground">transcribe →</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Every card is transcribed.</p>
              )}
              {done.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Done</p>
                  <div className="divide-y divide-border/60">
                    {done.map((c) => (
                      <Link key={c._id} href={`/upload-g/${c._id}?back=${back}`} className="flex items-center gap-3 py-1.5 text-sm hover:bg-accent/40">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{c.displayTitle}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {performerOf(c) || "—"} · {c.transcription?.details?.workDate ? shortDay(c.transcription.details.workDate) : "no date"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Keep transcribing</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{todo.length} card{todo.length === 1 ? "" : "s"} left. The top one is next.</p>
                <Button disabled={todo.length === 0} onClick={() => router.push(`/upload-g/${todo[0]?._id}?back=${back}`)}>Open the next card</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Or match the paychecks</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Price what is transcribed and set it against what was paid.</p>
                <Button variant="outline" onClick={() => go(4)}>Price every day →</Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Price every day</CardTitle>
            <p className="text-xs text-muted-foreground">The engine on each transcribed day, by its date and agreement.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {done.length === 0 ? (
              <Placeholder>Nothing transcribed yet — the days appear here as cards are finished.</Placeholder>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Performer</th>
                      <th className="py-2 pr-3 font-medium">Day</th>
                      <th className="py-2 pr-3 font-medium">Call</th>
                      <th className="py-2 pr-3 font-medium">Wrap</th>
                      <th className="py-2 font-medium text-right">Owed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((c) => {
                      const row = c.transcription?.rows?.[0] ?? {};
                      return (
                        <tr key={c._id} className="border-b border-border/40">
                          <td className="py-2 pr-3">{performerOf(c) || "—"}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{c.transcription?.details?.workDate ? shortDay(c.transcription.details.workDate) : "—"}</td>
                          <td className="py-2 pr-3">{row.callTime || "—"}</td>
                          <td className="py-2 pr-3">{row.dismissMakeupWardrobe || row.dismissOnSet || "—"}</td>
                          <td className="py-2 text-right text-muted-foreground">— not priced yet</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Placeholder>
              Placeholder: each row will run through the rate engine by its date and the agreement the audit
              names, the way a member's day does, and the total lands in the Owed column.
            </Placeholder>
            <div className="flex justify-end"><Button onClick={() => go(5)}>Next: match paychecks</Button></div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Match the paychecks</CardTitle>
            <p className="text-xs text-muted-foreground">What each performer was paid, against what each day came to.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Placeholder>
              Placeholder: per performer, the pay stubs or check totals go in beside the priced days (the pay-stub
              transcription already exists per day); a shortfall points at a line, not a total, and the reverse
              calculator says how a wrong figure was probably arrived at.
            </Placeholder>
            <div className="flex justify-end"><Button onClick={() => go(6)}>Next: the package</Button></div>
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">The package</CardTitle>
            <p className="text-xs text-muted-foreground">One report per performer, then the show. A sample, built from the cards so far.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Each performer&rsquo;s page lists their days with call and wrap, what the day came to, what was paid, and
              the gap, with totals; the cover names the show, the performers and the note. Owed and Paid are dashes
              until steps 4 and 5 are built.
            </p>
            <Button asChild>
              <a href={`/api/admin/audits/${id}/package`} target="_blank" rel="noreferrer">Open the sample PDF</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
