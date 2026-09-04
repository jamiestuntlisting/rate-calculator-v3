"use client";

import { useEffect, useRef } from "react";
import { makeThumbnail } from "@/lib/thumbnail";

export interface ThumbnailSubject {
  _id: string;
  path?: string;
  thumbPath?: string | null;
  contentType?: string;
}

/**
 * Make the missing thumbnails for a list, one at a time, in the browser
 * of whoever is looking: fetch the original, draw the small copy, PUT
 * it to the upload, and tell the list where it now is. One at a time
 * keeps a phone from decoding many photos at once (which is the thing
 * that blanked the list in the first place); a file that fails is not
 * retried this session.
 */
export function useThumbnails<T extends ThumbnailSubject>(
  items: T[] | null | undefined,
  onBuilt: (id: string, thumbPath: string) => void
) {
  const tried = useRef(new Set<string>());
  const running = useRef(false);
  const onBuiltRef = useRef(onBuilt);
  useEffect(() => {
    onBuiltRef.current = onBuilt;
  }, [onBuilt]);

  useEffect(() => {
    if (!items || running.current) return;
    const todo = items.filter(
      (u) =>
        !u.thumbPath &&
        u.path &&
        u.contentType?.startsWith("image/") &&
        !tried.current.has(u._id)
    );
    if (todo.length === 0) return;
    let live = true;
    running.current = true;
    (async () => {
      for (const u of todo) {
        if (!live) break;
        tried.current.add(u._id);
        try {
          const res = await fetch(u.path!);
          if (!res.ok) continue;
          const thumb = await makeThumbnail(await res.blob());
          if (!thumb || !live) continue;
          const put = await fetch(`/api/g-uploads/${u._id}/thumb`, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: thumb,
          });
          if (!put.ok) continue;
          const data = (await put.json()) as { thumbPath?: string };
          if (data.thumbPath && live) onBuiltRef.current(u._id, data.thumbPath);
        } catch {
          // Left without a thumbnail; the original still shows.
        }
      }
      running.current = false;
    })();
    return () => {
      live = false;
      running.current = false;
    };
  }, [items]);
}
