"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportPDF, exportXLSX, type ExportColumn, type ExportMenuProps } from "@/lib/exports";

// Re-export so callers can do: import { ExportMenu, type ExportColumn } from "@/components/export-menu";
export type { ExportColumn, ExportMenuProps };

export function ExportMenu<T>({
  rows,
  cols,
  filename,
  title,
  subtitle,
  orientation,
  className,
  label,
  businessName,
  tagline,
}: ExportMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const doXLSX = () => {
    exportXLSX(rows, cols, { filename, title, subtitle, businessName, tagline });
    setOpen(false);
  };
  const doPDF = () => {
    exportPDF(rows, cols, { filename, title, subtitle, orientation, businessName, tagline });
    setOpen(false);
  };

  const disabled = !rows || rows.length === 0;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={className || "btn"}
        title={disabled ? "Nothing to export" : "Export"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <Download size={14} />
        {label || "Export"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 50,
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            minWidth: 160,
            padding: 4,
          }}
        >
          <button
            type="button"
            onClick={doXLSX}
            style={menuItemStyle}
          >
            <FileSpreadsheet size={14} color="#16a34a" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={doPDF}
            style={menuItemStyle}
          >
            <FileText size={14} color="#dc2626" />
            <span>PDF (.pdf)</span>
          </button>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 10px",
  fontSize: 13,
  background: "transparent",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  textAlign: "left",
  color: "var(--text-primary)",
};
