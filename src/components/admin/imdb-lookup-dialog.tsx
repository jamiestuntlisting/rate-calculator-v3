"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  imdbPersonSearchUrl,
  imdbTitleSearchUrl,
  normalizeImdbId,
  normalizeImdbTitleId,
  type ImdbSuggestion,
} from "@/lib/imdb";

/**
 * Look a show or a person up on IMDb and pick the id: the row's name
 * is the first query, the hits come from IMDb's suggestion service
 * through the admin proxy, and one tap keeps the id. An id or a page
 * URL can be pasted instead, and IMDb's own search is a link away when
 * the service is down.
 */
export function ImdbLookupDialog({
  type,
  subject,
  currentId,
  onClose,
  onPick,
}: {
  type: "title" | "name";
  /** What is being looked up — the show or the member — and the first query. */
  subject: string;
  currentId: string | null;
  onClose: () => void;
  /** null clears the id. */
  onPick: (id: string | null) => Promise<void> | void;
}) {
  const [query, setQuery] = useState(subject);
  const [results, setResults] = useState<ImdbSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(currentId ?? "");
  const [busy, setBusy] = useState(false);
  const normalize = type === "title" ? normalizeImdbTitleId : normalizeImdbId;

  const search = async (q: string) => {
    if (q.trim().length < 2) return;
    setResults(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/imdb/search?type=${type}&q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json()) as { results?: ImdbSuggestion[]; error?: string };
      setResults(data.results ?? []);
      if (!res.ok) setError(data.error ?? "IMDb did not answer");
    } catch {
      setResults([]);
      setError("IMDb did not answer");
    }
  };

  useEffect(() => {
    void search(subject);
    // The first search is the subject as given; later ones are typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, type]);

  const pick = async (id: string | null) => {
    setBusy(true);
    try {
      await onPick(id);
    } finally {
      setBusy(false);
    }
  };

  const manualId = normalize(manual);
  const searchUrl = type === "title" ? imdbTitleSearchUrl(query) : imdbPersonSearchUrl(query);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {type === "title" ? "Which IMDb title is" : "Who on IMDb is"} {subject}?
          </DialogTitle>
          <DialogDescription>
            Tap a hit to keep its id, or paste an id or an IMDb page below.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search IMDb" className="h-10" />
          <Button type="submit" variant="outline" className="h-10 shrink-0">
            Search
          </Button>
        </form>
        <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border">
          {results === null ? (
            <p className="p-3 text-sm text-muted-foreground">Searching IMDb…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {error ? `${error}. ` : "Nothing came back. "}
              <a href={searchUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Search on IMDb ↗
              </a>{" "}
              and paste the id below.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {results.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-2">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="h-12 w-9 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="h-12 w-9 shrink-0 rounded bg-muted/50" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.detail}
                      {r.detail ? " · " : ""}
                      <a href={r.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        {r.id} ↗
                      </a>
                    </span>
                  </span>
                  <Button size="sm" variant={r.id === currentId ? "secondary" : "default"} disabled={busy} onClick={() => void pick(r.id)}>
                    {r.id === currentId ? "Kept" : "Use this"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={type === "title" ? "tt1234567, or the title's IMDb page" : "nm1234567, or their IMDb page"}
            aria-label="Paste an IMDb id"
            className="h-10 min-w-0 flex-1"
          />
          <Button variant="outline" className="h-10" disabled={busy || !manualId} onClick={() => void pick(manualId)}>
            Save id
          </Button>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {currentId ? (
            <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => void pick(null)}>
              Clear the id
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
