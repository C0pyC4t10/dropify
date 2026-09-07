"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyOption?: SearchableOption;
  disabled?: boolean;
}

/**
 * Lightweight searchable dropdown — themed to match the rest of the app.
 * Replaces a native <select> when the option list is too long to scroll
 * (e.g. customer list, Dhaka area list).
 *
 * Supports: type-to-filter, arrow-key navigation, Enter to pick,
 * Escape to close, click-outside to close, optional empty option.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyOption,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const allOptions = useMemo(
    () => (emptyOption ? [emptyOption, ...options] : options),
    [emptyOption, options]
  );

  const selected = allOptions.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q)
    );
  }, [allOptions, query]);

  // Highlight index clamped to the filtered list size — guards against
  // stale state if `filtered` shrinks (e.g. user types and the previous
  // highlight row no longer exists).
  const clampedHighlight =
    filtered.length === 0 ? 0 : Math.min(highlight, filtered.length - 1);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-idx="${clampedHighlight}"]`
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [clampedHighlight]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[clampedHighlight];
      if (pick) choose(pick.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "8px 12px",
          background: "var(--bg-primary)",
          border: `1px solid ${open ? "var(--accent-green)" : "var(--border)"}`,
          borderRadius: 6,
          color: selected ? "var(--text-primary)" : "var(--text-muted)",
          fontSize: 14,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            opacity: 0.6,
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            zIndex: 50,
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            maxHeight: 280,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "relative",
              padding: 6,
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              style={{ paddingLeft: 30, paddingRight: 28, fontSize: 13 }}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                }}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div ref={listRef} style={{ overflowY: "auto", flex: 1, padding: 4 }}>
            {filtered.length === 0 && (
              <div
                style={{
                  padding: "10px 8px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                No matches.
              </div>
            )}
            {filtered.map((o, i) => {
              const isSelected = o.value === value;
              const isHighlighted = i === clampedHighlight;
              return (
                <button
                  key={o.value}
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(o.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 10px",
                    border: "none",
                    background: isHighlighted
                      ? "var(--bg-hover)"
                      : "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 4,
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      fontWeight: isSelected ? 600 : 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.label}
                  </div>
                  {o.hint && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {o.hint}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
