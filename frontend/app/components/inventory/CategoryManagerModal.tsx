"use client";

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type Category,
} from "@/lib/inventory";

const FIELD_INPUT = "field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink";

/**
 * Localized category nesting manager. Top-level categories are listed with
 * their children indented beneath them; new categories can be added under any
 * parent, renamed inline, or deleted (products fall back to uncategorised).
 */
export function CategoryManagerModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const parents = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);
  const orphans = useMemo(
    () => categories.filter((c) => c.parentId && !categories.some((p) => p.id === c.parentId)),
    [categories],
  );

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await createCategory({ name: newName.trim(), parentId: newParent });
    setBusy(false);
    if (res.ok) {
      setNewName("");
      setNewParent("");
      onChanged();
    } else {
      setError(res.error ?? res.errors?.name ?? "Could not add category.");
    }
  }

  async function saveRename(id: string) {
    if (!editingName.trim()) return;
    setBusy(true);
    const res = await updateCategory(id, { name: editingName.trim() });
    setBusy(false);
    if (res.ok) {
      setEditingId(null);
      onChanged();
    } else {
      setError(res.error ?? res.errors?.name ?? "Could not rename category.");
    }
  }

  async function remove(c: Category) {
    const kids = childrenOf(c.id).length;
    const msg = kids
      ? `Delete "${c.name}" and unnest its ${kids} sub-categor${kids === 1 ? "y" : "ies"}? Products move to Uncategorised.`
      : `Delete "${c.name}"? Its products move to Uncategorised.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    const res = await deleteCategory(c.id);
    setBusy(false);
    if (res.ok) onChanged();
    else setError(res.error ?? "Could not delete category.");
  }

  const row = (c: Category, child = false) => (
    <div
      key={c.id}
      className={
        "flex items-center gap-2 py-2 " + (child ? "pl-7" : "")
      }
    >
      <Icon
        name={child ? "tag" : "layers"}
        className="w-4 h-4 text-ink-faint shrink-0"
        strokeWidth={1.7}
      />
      {editingId === c.id ? (
        <input
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveRename(c.id);
            if (e.key === "Escape") setEditingId(null);
          }}
          className={FIELD_INPUT + " py-1.5 flex-1"}
          autoFocus
        />
      ) : (
        <span className="flex-1 text-[14px] font-semibold text-ink truncate">{c.name}</span>
      )}

      {editingId === c.id ? (
        <button
          type="button"
          onClick={() => void saveRename(c.id)}
          className="text-[12.5px] font-bold text-brand-600 hover:text-brand-700 px-2 py-1"
        >
          Save
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingId(c.id);
            setEditingName(c.name);
          }}
          aria-label="Rename"
          className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint hover:text-ink hover:bg-paper transition"
        >
          <Icon name="pencil" className="w-4 h-4" strokeWidth={1.7} />
        </button>
      )}
      <button
        type="button"
        onClick={() => void remove(c)}
        aria-label="Delete"
        className="grid place-items-center w-8 h-8 rounded-[8px] text-ink-faint hover:text-rose-600 hover:bg-rose-50 transition"
      >
        <Icon name="trash" className="w-4 h-4" strokeWidth={1.7} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center px-4 py-8 overflow-y-auto" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 bg-black/50 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[480px] rounded-xl2 bg-surface hairline shadow-soft overlay-card">
        <div className="flex items-center justify-between px-6 py-4 hairline-b">
          <h3 className="text-[1.15rem] font-extrabold tracking-tightest">Manage categories</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Add */}
        <div className="px-6 py-4 hairline-b bg-paper/60">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder="New category name"
              className={FIELD_INPUT + " flex-1"}
            />
            <select value={newParent} onChange={(e) => setNewParent(e.target.value)} className={FIELD_INPUT + " sm:w-40"}>
              <option value="">Top level</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  Under {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy || !newName.trim()}
              className="inline-flex items-center justify-center gap-1.5 bg-brand-50 text-brand-600 hover:bg-brand-100 font-medium px-4 py-2.5 rounded-[10px] text-sm transition duration-150 ease-in-out disabled:opacity-50"
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
              Add
            </button>
          </div>
          {error && <p className="mt-2 text-[12.5px] font-semibold text-rose-600">{error}</p>}
        </div>

        {/* List */}
        <div className="px-6 py-3 max-h-[44vh] overflow-y-auto divide-y divide-[rgba(11,18,32,0.07)]">
          {categories.length === 0 && (
            <p className="py-8 text-center text-[13.5px] text-ink-soft">No categories yet. Add your first above.</p>
          )}
          {parents.map((p) => (
            <div key={p.id}>
              {row(p)}
              {childrenOf(p.id).map((c) => row(c, true))}
            </div>
          ))}
          {orphans.map((c) => row(c))}
        </div>
      </div>
    </div>
  );
}
