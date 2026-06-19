"use client"

import type { CanvasBlock, CalloutVariant } from "@/lib/canvas-blocks/types"

type Props = {
  block: CanvasBlock
  editable?: boolean
  onChange?: (props: Record<string, unknown>) => void
}

function EditableText({
  value,
  onChange,
  multiline,
  className,
}: {
  value: string
  onChange?: (v: string) => void
  multiline?: boolean
  className?: string
}) {
  if (!onChange) {
    return <span className={className}>{value}</span>
  }
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full resize-none border-0 bg-transparent outline-none ${className ?? ""}`}
        rows={3}
      />
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full border-0 bg-transparent outline-none ${className ?? ""}`}
    />
  )
}

function BlockInner({
  block,
  editable,
  onChange,
  onBlockChange,
}: {
  block: CanvasBlock
  editable?: boolean
  onChange?: (props: Record<string, unknown>) => void
  onBlockChange?: (blockId: string, props: Record<string, unknown>) => void
}) {
  const p = block.props

  switch (block.type) {
    case "heading": {
      const level = (p.level as number) ?? 2
      const text = (p.text as string) ?? ""
      const cls =
        level === 1 ? "cb-heading-1" : level === 3 ? "cb-heading-3" : "cb-heading-2"
      return (
        <EditableText
          value={text}
          onChange={onChange ? (v) => onChange({ text: v }) : undefined}
          className={cls}
        />
      )
    }
    case "paragraph":
      return (
        <EditableText
          value={(p.text as string) ?? ""}
          onChange={onChange ? (v) => onChange({ text: v }) : undefined}
          multiline
          className="cb-paragraph"
        />
      )
    case "divider":
      return <hr className="cb-divider" />
    case "chapter_header":
      return (
        <div className="cb-chapter">
          <div className="cb-chapter-num">{(p.numeral as string) ?? "I"}</div>
          <div className="cb-chapter-period">{(p.period as string) ?? ""}</div>
          <div className="cb-chapter-title">{(p.title as string) ?? ""}</div>
        </div>
      )
    case "callout": {
      const variant = ((p.variant as string) ?? "dica") as CalloutVariant
      return (
        <div className={`cb-callout cb-callout-${variant}`}>
          <div className="cb-callout-title">{(p.title as string) ?? ""}</div>
          <div className="cb-paragraph">{(p.body as string) ?? ""}</div>
        </div>
      )
    }
    case "timeline": {
      const items = (p.items as { date: string; content: string }[]) ?? []
      return (
        <div className="cb-timeline">
          {items.map((item, i) => (
            <div key={i} className="cb-timeline-item">
              <div className="cb-timeline-date">{item.date}</div>
              <div>{item.content}</div>
            </div>
          ))}
        </div>
      )
    }
    case "mini_cards": {
      const cards = (p.cards as { title: string; body: string }[]) ?? []
      return (
        <div className="cb-columns cb-columns-2">
          {cards.map((card, i) => (
            <div key={i} className="cb-mini-card">
              <div className="cb-mini-card-title">{card.title}</div>
              <div className="cb-paragraph">{card.body}</div>
            </div>
          ))}
        </div>
      )
    }
    case "pills": {
      const items = (p.items as string[]) ?? []
      const tone = (p.tone as string) ?? "gold"
      return (
        <div>
          {items.map((item, i) => (
            <span key={i} className={`cb-pill cb-pill-${tone}`}>
              {item}
            </span>
          ))}
        </div>
      )
    }
    case "table": {
      const headers = (p.headers as string[]) ?? []
      const rows = (p.rows as string[][]) ?? []
      return (
        <div className="cb-table-wrap">
          <table className="cb-table">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case "checklist": {
      const items = (p.items as { text: string; checked: boolean }[]) ?? []
      return (
        <div className="cb-checklist">
          {items.map((item, i) => (
            <label key={i}>
              <input type="checkbox" checked={item.checked} readOnly />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      )
    }
    case "numbered_list": {
      const items = (p.items as string[]) ?? []
      return (
        <ol className="list-decimal pl-5">
          {items.map((item, i) => (
            <li key={i} className="mb-1">
              {item}
            </li>
          ))}
        </ol>
      )
    }
    case "accordion": {
      const items = (p.items as { title: string; body: string }[]) ?? []
      return (
        <div className="cb-accordion">
          {items.map((item, i) => (
            <details key={i} open={i === 0}>
              <summary>{item.title}</summary>
              <div className="cb-accordion-body">{item.body}</div>
            </details>
          ))}
        </div>
      )
    }
    case "quote":
      return (
        <blockquote className="cb-quote">
          {(p.text as string) ?? ""}
          {(p.footer as string) && (
            <footer className="mt-2 text-sm not-italic">— {p.footer as string}</footer>
          )}
        </blockquote>
      )
    case "formula":
      return (
        <div className="cb-formula">
          <div>{(p.formula as string) ?? ""}</div>
          {(p.caption as string) && (
            <small className="mt-1 block text-sm font-normal text-slate-500">
              {p.caption as string}
            </small>
          )}
        </div>
      )
    case "code":
      return <pre className="cb-code">{(p.code as string) ?? ""}</pre>
    case "bar_chart": {
      const items = (p.items as { label: string; value: number }[]) ?? []
      const max = Math.max(...items.map((i) => i.value), 1)
      return (
        <div>
          {(p.title as string) && (
            <p className="mb-2 text-sm font-medium text-slate-600">{p.title as string}</p>
          )}
          <div className="cb-bar-chart">
            {items.map((item, i) => (
              <div key={i} className="cb-bar-col">
                <div
                  className="cb-bar"
                  style={{ height: `${Math.round((item.value / max) * 100)}%` }}
                />
                <span className="cb-bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case "sketch":
      return (
        <div className="cb-sketch">
          {(p.strokes as string) ? "Esboço salvo" : "Área de esboço"}
        </div>
      )
    case "section":
      return (
        <div>
          {(p.title as string) && <div className="cb-section-title">{p.title as string}</div>}
          {block.children?.map((child) => (
            <CanvasBlockView
              key={child.id}
              block={child}
              editable={editable}
              onBlockChange={onBlockChange}
            />
          ))}
        </div>
      )
    case "columns": {
      const count = (p.count as number) ?? 2
      const children = block.children ?? []
      return (
        <div className={`cb-columns cb-columns-${count}`}>
          {children.map((child) => (
            <div key={child.id}>
              <CanvasBlockView
                block={child}
                editable={editable}
                onBlockChange={onBlockChange}
              />
            </div>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}

type BlockViewProps = {
  block: CanvasBlock
  editable?: boolean
  onBlockChange?: (blockId: string, props: Record<string, unknown>) => void
}

export function CanvasBlockView({ block, editable, onBlockChange }: BlockViewProps) {
  return (
    <div className="cb-block" data-block-id={block.id} data-block-type={block.type}>
      <BlockInner
        block={block}
        editable={editable}
        onChange={
          onBlockChange ? (props) => onBlockChange(block.id, props) : undefined
        }
        onBlockChange={onBlockChange}
      />
    </div>
  )
}

type DocProps = {
  blocks: CanvasBlock[]
  editable?: boolean
  onBlockChange?: (blockId: string, props: Record<string, unknown>) => void
}

export default function CanvasDocumentRenderer({
  blocks,
  editable,
  onBlockChange,
}: DocProps) {
  return (
    <div className="canvas-doc">
      {blocks.map((block) => (
        <CanvasBlockView
          key={block.id}
          block={block}
          editable={editable}
          onBlockChange={onBlockChange}
        />
      ))}
    </div>
  )
}
