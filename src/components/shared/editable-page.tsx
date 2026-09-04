"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";

/**
 * In-place copy editing for the public pages.
 *
 * An admin viewing the page gets a small Edit control; in edit mode every
 * `<Editable>` becomes a contentEditable region, and Save writes the lot
 * to app_config through /api/page-content. Everyone else just reads the
 * page, with any saved overrides applied — the code keeps the defaults, so
 * a page with nothing saved is exactly the page as written.
 *
 * This exists so a headline or a price can be tried out on the phone in
 * the moment it comes to mind, not queued behind a deploy.
 */

interface EditableContextValue {
  values: Record<string, string>;
  editing: boolean;
  setValue: (key: string, value: string) => void;
}

const EditableContext = createContext<EditableContextValue>({
  values: {},
  editing: false,
  setValue: () => {},
});

export function EditablePage({
  page,
  children,
}: {
  page: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const admin = Boolean(user && (user.role === "admin" || isAdminEmail(user.email)));
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Edits land here as they happen; Save merges them into values.
  const draft = useRef<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/page-content/${page}`)
      .then((r) => r.json())
      .then((data) => setValues(data.values ?? {}))
      .catch(() => {});
  }, [page]);

  const setValue = useCallback((key: string, value: string) => {
    draft.current[key] = value;
  }, []);

  const save = async () => {
    setSaving(true);
    const merged = { ...values, ...draft.current };
    try {
      const res = await fetch(`/api/page-content/${page}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: merged }),
      });
      if (!res.ok) throw new Error();
      setValues(merged);
      draft.current = {};
      setEditing(false);
      toast.success("Page saved — live for everyone");
    } catch {
      toast.error("Couldn't save the page");
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditableContext.Provider value={{ values, editing, setValue }}>
      {children}
      {admin && (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-lg flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  draft.current = {};
                  setEditing(false);
                }}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm shadow-lg flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full border border-border bg-background/95 px-4 py-2 text-sm shadow-lg flex items-center gap-2"
            >
              <Pencil className="h-4 w-4" />
              Edit page
            </button>
          )}
        </div>
      )}
    </EditableContext.Provider>
  );
}

/**
 * One editable string. `k` names it in the override store; `d` is the
 * default written in the code. Keys survive rewording, so name them for
 * the slot ("hero.title"), not the current text.
 */
export function Editable({
  k,
  d,
  className = "",
}: {
  k: string;
  d: string;
  className?: string;
}) {
  const { values, editing, setValue } = useContext(EditableContext);
  const text = values[k] ?? d;

  if (!editing) return <span className={className}>{text}</span>;
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => setValue(k, e.currentTarget.textContent ?? "")}
      className={`${className} outline-dashed outline-1 outline-primary/60 rounded-sm px-0.5 focus:outline-primary focus:outline-2`}
    >
      {text}
    </span>
  );
}
