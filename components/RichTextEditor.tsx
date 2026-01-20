"use client"

import { useRef, useEffect, useState } from "react"
import { Bold, Underline, Palette } from "lucide-react"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

export default function RichTextEditor({ value, onChange, placeholder = "", rows = 3 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [selectedColor, setSelectedColor] = useState("#000000")
  const [isEmpty, setIsEmpty] = useState(true)

  const colors = [
    "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", 
    "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080",
    "#008000", "#800000", "#008080", "#FFC0CB", "#A52A2A"
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Permite Enter para quebrar linha
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      document.execCommand("insertHTML", false, "<br>")
      handleInput()
    }
  }

  const execCommand = (command: string, value: string | boolean = false) => {
    document.execCommand(command, false, value as string)
    editorRef.current?.focus()
    handleInput()
  }

  const applyColor = (color: string) => {
    setSelectedColor(color)
    execCommand("foreColor", color)
    setShowColorPicker(false)
  }

  const getMinHeight = () => {
    return `${rows * 1.5}rem`
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border border-slate-300 rounded-t-lg p-2 bg-slate-50">
        <button
          type="button"
          onClick={() => execCommand("bold")}
          className="p-2 rounded hover:bg-slate-200 transition"
          title="Negrito (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand("underline")}
          className="p-2 rounded hover:bg-slate-200 transition"
          title="Sublinhado (Ctrl+U)"
        >
          <Underline className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-2 rounded hover:bg-slate-200 transition flex items-center gap-1"
            title="Cor do texto"
          >
            <Palette className="h-4 w-4" />
            <div
              className="w-4 h-4 rounded border border-slate-400"
              style={{ backgroundColor: selectedColor }}
            />
          </button>
          {showColorPicker && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowColorPicker(false)}
              />
              <div className="absolute top-full left-0 z-20 mt-2 p-3 bg-white border border-slate-300 rounded-lg shadow-lg">
                <div className="grid grid-cols-5 gap-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => applyColor(color)}
                      className="w-8 h-8 rounded border border-slate-300 hover:scale-110 transition"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => applyColor(e.target.value)}
                    className="w-full h-8 cursor-pointer"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onKeyDown={handleKeyDown}
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
          className="w-full rounded-b-lg border border-t-0 border-slate-300 p-2 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-0 min-h-[3rem] break-words overflow-wrap-anywhere relative z-10"
          style={{ 
            minHeight: getMinHeight(),
            wordWrap: 'break-word',
            overflowWrap: 'break-word'
          }}
          suppressContentEditableWarning
        />
        {isEmpty && placeholder && (
          <div 
            className="absolute top-2 left-2 text-slate-400 pointer-events-none z-0"
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
