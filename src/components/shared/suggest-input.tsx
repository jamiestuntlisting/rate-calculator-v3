"use client";

import { useEffect, useState } from "react";
import { ShowCombobox } from "@/components/shared/show-combobox";

/**
 * A text field that offers the names already in use, so the same
 * production or role is not spelled three different ways. Typing
 * something new is still allowed — it simply joins the list, unless an
 * admin has blocked it.
 *
 * This used to be a <datalist>, which iOS never draws on the page — the
 * suggestions hide in the keyboard strip and read as nothing. It now
 * renders the same real dropdown the weekly page uses, so "ND Stu"
 * visibly offers "ND Stunt" on every platform.
 */
export function SuggestInput({
  kind,
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  kind: "show" | "character";
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [names, setNames] = useState<string[]>([]);

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
    <ShowCombobox
      id={id}
      value={value}
      onChange={onChange}
      options={names}
      placeholder={placeholder}
      className={className}
    />
  );
}
