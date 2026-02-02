"use client"

import { useRef, useEffect, useState } from "react"
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Type
} from "lucide-react"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

const FONT_SIZES = [
  { label: "Pequeno", value: "1" },
  { label: "Normal", value: "3" },
  { label: "Médio", value: "4" },
  { label: "Grande", value: "5" },
  { label: "Extra", value: "6" }
]

const FONT_FAMILIES = [
  { label: "Padrão", value: "" },
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Verdana", value: "Verdana" }
]

export default function RichTextEditor({ value, onChange, placeholder = "", rows = 3 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const [showFontFamily, setShowFontFamily] = useState(false)
  const [selectedColor, setSelectedColor] = useState("#000000")
  const [previewColor, setPreviewColor] = useState("#000000")
  const [isEmpty, setIsEmpty] = useState(true)

  const basicColors = [
    "#000000", "#FF0000", "#008000", "#0000FF",
    "#FFA500", "#6B7280"
  ]

  const [isInternalUpdate, setIsInternalUpdate] = useState(false)

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate) {
      if (value === "") {
        if (editorRef.current.innerHTML !== "") {
          editorRef.current.innerHTML = ""
        }
      } else if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value
      }
    }
    setIsInternalUpdate(false)
  }, [value, isInternalUpdate])

  const handleInput = () => {
    if (editorRef.current) {
      setIsInternalUpdate(true)
      const html = editorRef.current.innerHTML
      onChange(html)
      setIsEmpty(!html || html.trim() === "" || html === "<br>")
    }
  }

  useEffect(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      setIsEmpty(!html || html.trim() === "" || html === "<br>")
    }
  }, [value])

  const execCommand = (command: string, value: string | boolean = false) => {
    document.execCommand(command, false, value as string)
    editorRef.current?.focus()
    handleInput()
  }

  const applyColor = (color: string) => {
    setSelectedColor(color)
    // Restaura a seleção antes de aplicar a cor
    if (savedSelectionRef.current && editorRef.current) {
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(savedSelectionRef.current)
        savedSelectionRef.current = null
      }
    }
    editorRef.current?.focus()
    execCommand("foreColor", color)
    setShowColorPicker(false)
  }

  const openColorPicker = () => {
    // Salva a seleção antes de abrir (editor ainda tem foco se usarmos preventDefault no botão)
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange()
    } else {
      savedSelectionRef.current = null
    }
    setPreviewColor(selectedColor)
    setShowColorPicker(true)
    setShowFontSize(false)
    setShowFontFamily(false)
  }

  const applyFontSize = (size: string) => {
    if (size) execCommand("fontSize", size)
    setShowFontSize(false)
  }

  const applyFontFamily = (font: string) => {
    if (font) execCommand("fontName", font)
    setShowFontFamily(false)
  }

  const getMinHeight = () => {
    return `${rows * 1.5}rem`
  }

  const toolbarBtn = "p-2 rounded hover:bg-slate-200 transition text-slate-800"

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border border-slate-300 rounded-t-lg p-2 bg-slate-50">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("bold")}
          className={toolbarBtn}
          title="Negrito (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("italic")}
          className={toolbarBtn}
          title="Itálico (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("underline")}
          className={toolbarBtn}
          title="Sublinhado (Ctrl+U)"
        >
          <Underline className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("strikeThrough")}
          className={toolbarBtn}
          title="Riscado"
        >
          <Strikethrough className="h-4 w-4" />
        </button>

        <span className="mx-1 w-px h-5 bg-slate-300" aria-hidden />

        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowFontSize(!showFontSize); setShowFontFamily(false); setShowColorPicker(false) }}
            className={`${toolbarBtn} flex items-center gap-1`}
            title="Tamanho da fonte"
          >
            <Type className="h-4 w-4" />
            <span className="text-xs font-medium">A</span>
          </button>
          {showFontSize && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFontSize(false)} />
              <div className="absolute top-full left-0 z-20 mt-2 py-2 bg-white border border-slate-300 rounded-lg shadow-lg min-w-[140px]">
                {FONT_SIZES.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => applyFontSize(value)}
                    className="w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowFontFamily(!showFontFamily); setShowFontSize(false); setShowColorPicker(false) }}
            className={`${toolbarBtn} flex items-center gap-1`}
            title="Fonte"
          >
            <span className="text-sm font-serif">Aa</span>
          </button>
          {showFontFamily && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFontFamily(false)} />
              <div className="absolute top-full left-0 z-20 mt-2 py-2 bg-white border border-slate-300 rounded-lg shadow-lg min-w-[180px]">
                {FONT_FAMILIES.map(({ label, value }) => (
                  <button
                    key={value || "default"}
                    type="button"
                    onClick={() => applyFontFamily(value || "Arial")}
                    className="w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                    style={value ? { fontFamily: value } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => showColorPicker ? setShowColorPicker(false) : openColorPicker()}
            className={`${toolbarBtn} flex items-center gap-1`}
            title="Cor do texto"
          >
            <Palette className="h-4 w-4" />
            <div
              className="w-4 h-4 rounded border border-slate-500"
              style={{ backgroundColor: selectedColor }}
            />
          </button>
          {showColorPicker && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => applyColor(previewColor)}
              />
              <div className="absolute top-full left-0 z-20 mt-2 p-3 bg-white border border-slate-300 rounded-lg shadow-lg" onClick={e => e.stopPropagation()}>
                <div className="flex flex-wrap gap-2">
                  {basicColors.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => applyColor(color)}
                      className="w-7 h-7 rounded border border-slate-300 hover:ring-2 hover:ring-slate-400 transition shrink-0"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Cor personalizada
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={previewColor}
                      onChange={(e) => setPreviewColor(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded border border-slate-300 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => applyColor(previewColor)}
                      className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 transition shrink-0"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <span className="mx-1 w-px h-5 bg-slate-300" aria-hidden />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("insertUnorderedList")}
          className={toolbarBtn}
          title="Lista com marcadores"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("insertOrderedList")}
          className={toolbarBtn}
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </button>

        <span className="mx-1 w-px h-5 bg-slate-300" aria-hidden />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("justifyLeft")}
          className={toolbarBtn}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("justifyCenter")}
          className={toolbarBtn}
          title="Centralizar"
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCommand("justifyRight")}
          className={toolbarBtn}
          title="Alinhar à direita"
        >
          <AlignRight className="h-4 w-4" />
        </button>
      </div>

      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onFocus={() => {
            if (editorRef.current && isEmpty) {
              editorRef.current.innerHTML = ""
              setIsEmpty(false)
            }
          }}
          onBlur={() => {
            if (editorRef.current) {
              const html = editorRef.current.innerHTML
              setIsEmpty(!html || html.trim() === "" || html === "<br>")
            }
          }}
          className="w-full rounded-b-lg border border-t-0 border-slate-300 p-2 text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-0 min-h-[3rem] break-words overflow-wrap-anywhere relative z-10"
          style={{ 
            minHeight: getMinHeight(),
            wordWrap: 'break-word',
            overflowWrap: 'break-word'
          }}
          suppressContentEditableWarning
        />
        {isEmpty && placeholder && (
          <div 
            className="absolute top-2 left-2 text-slate-700 pointer-events-none z-0"
            style={{ 
              minHeight: getMinHeight(),
              lineHeight: '1.5rem'
            }}
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  )
}
