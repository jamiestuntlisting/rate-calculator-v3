"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A text field that offers the names already in use, so the same production
 * or role is not spelled three different ways. Typing something new is
 * still allowed — it simply joins the list, unless an admin has blocked it.
 */
export function SuggestInput({
  kind,
  ...props
}: { kind: "show" | "character" } & React.ComponentProps<typeof Input>) {
  const [names, setNames] = useState<string[]>([]);
  const listId = `${kind}-suggestions`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/suggestions?kind=${kind}`)
      .then((r) => (r.ok ? r.json() : { names: [] }))
      .then((data: { names?: string[] }) => {
        if (!cancelled) setNames(data.names ?? []);
      })
      .catch(() => {
        /* autocomplete is a convenience; typing still works without it */
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return (
    <>
      <Input {...props} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
