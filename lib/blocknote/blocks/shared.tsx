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
        {value || <span className="cb-placeholder">{placeholder}</span>}
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
        className={`w-full resize-none border-0 bg-transparent outline-none cb-field cb-field-multiline ${className ?? ""}`}
      />
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border-0 bg-transparent outline-none cb-field ${className ?? ""}`}
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
  return <div className="cb-block-actions">{children}</div>
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
      className="cb-btn-ghost"
    >
      {children}
    </button>
  )
}
