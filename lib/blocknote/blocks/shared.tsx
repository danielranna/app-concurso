"use client"

import type { BlockNoteEditor } from "@blocknote/core"

export function updateProps(
  editor: BlockNoteEditor<any, any, any>,
  blockId: string,
  props: Record<string, string | boolean | number>
) {
  editor.updateBlock(blockId, { props: props as never })
}

type FieldProps = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  multiline?: boolean
  readOnly?: boolean
}

export function BlockField({
  value,
  onChange,
  placeholder,
  className,
  multiline,
  readOnly,
}: FieldProps) {
  if (readOnly) {
    return (
      <span className={className}>
        {value || <span className="text-slate-400">{placeholder}</span>}
      </span>
    )
  }
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`w-full resize-none border-0 bg-transparent outline-none ${className ?? ""}`}
      />
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border-0 bg-transparent outline-none ${className ?? ""}`}
    />
  )
}

export function BlockActions({
  children,
  readOnly,
}: {
  children: React.ReactNode
  readOnly?: boolean
}) {
  if (readOnly) return null
  return <div className="mt-2 flex flex-wrap gap-1">{children}</div>
}

export function SmallButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
    >
      {children}
    </button>
  )
}
