"use client"

import { useCallback, useEffect, useRef } from "react"
import { createReactBlockSpec } from "@blocknote/react"
import { BlockActions, SmallButton, updateProps } from "./shared"

export const createSketchPad = createReactBlockSpec(
  {
    type: "sketchPad",
    propSchema: {
      dataUrl: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const canvasRef = useRef<HTMLCanvasElement>(null)
      const drawing = useRef(false)

      const loadImage = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas || !block.props.dataUrl) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const img = new Image()
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
        img.src = block.props.dataUrl
      }, [block.props.dataUrl])

      useEffect(() => {
        loadImage()
      }, [loadImage])

      function saveCanvas() {
        const canvas = canvasRef.current
        if (!canvas) return
        updateProps(editor, block.id, { dataUrl: canvas.toDataURL("image/png") })
      }

      function clearCanvas() {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        updateProps(editor, block.id, { dataUrl: "" })
      }

      return (
        <div className="canvas-esboco-wrap">
          <canvas
            ref={canvasRef}
            width={560}
            height={200}
            className="cb-sketch w-full cursor-crosshair border-solid"
            onMouseDown={(e) => {
              if (readOnly) return
              drawing.current = true
              const canvas = canvasRef.current
              const ctx = canvas?.getContext("2d")
              if (!ctx || !canvas) return
              const rect = canvas.getBoundingClientRect()
              ctx.beginPath()
              ctx.moveTo(
                e.clientX - rect.left,
                e.clientY - rect.top
              )
            }}
            onMouseMove={(e) => {
              if (!drawing.current || readOnly) return
              const canvas = canvasRef.current
              const ctx = canvas?.getContext("2d")
              if (!ctx || !canvas) return
              const rect = canvas.getBoundingClientRect()
              ctx.lineWidth = 2
              ctx.lineCap = "round"
              ctx.strokeStyle = "#2b2a28"
              ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
              ctx.stroke()
            }}
            onMouseUp={() => {
              if (!drawing.current) return
              drawing.current = false
              saveCanvas()
            }}
            onMouseLeave={() => {
              if (drawing.current) {
                drawing.current = false
                saveCanvas()
              }
            }}
          />
          <BlockActions readOnly={readOnly}>
            <SmallButton onClick={clearCanvas}>Limpar</SmallButton>
          </BlockActions>
        </div>
      )
    },
  }
)
