"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { parseJsonProp, stringifyJsonProp } from "../helpers"
import { BlockActions, BlockField, SmallButton, updateProps } from "./shared"

export const createTableCompare = createReactBlockSpec(
  {
    type: "tableCompare",
    propSchema: {
      headersJson: { default: '["Coluna A","Coluna B"]' },
      rowsJson: { default: "[]" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const headers = parseJsonProp<string[]>(block.props.headersJson, [
        "Coluna A",
        "Coluna B",
      ])
      const rows = parseJsonProp<string[][]>(block.props.rowsJson, [])
      const setHeaders = (next: string[]) =>
        updateProps(editor, block.id, { headersJson: stringifyJsonProp(next) })
      const setRows = (next: string[][]) =>
        updateProps(editor, block.id, { rowsJson: stringifyJsonProp(next) })

      return (
        <div>
          <div className="tabela-wrapper">
            <table className="tabela-comparativa cb-table">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>
                      <BlockField
                        value={h}
                        readOnly={readOnly}
                        className="cb-field text-inherit"
                        onChange={(v) => {
                          const next = [...headers]
                          next[i] = v
                          setHeaders(next)
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {headers.map((_, ci) => (
                      <td key={ci}>
                        <BlockField
                          value={row[ci] ?? ""}
                          readOnly={readOnly}
                          className="cb-field"
                          onChange={(v) => {
                            const next = rows.map((r) => [...r])
                            if (!next[ri]) next[ri] = []
                            next[ri][ci] = v
                            setRows(next)
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <BlockActions readOnly={readOnly}>
            <SmallButton
              onClick={() => setRows([...rows, headers.map(() => "")])}
            >
              + linha
            </SmallButton>
            <SmallButton
              onClick={() => setHeaders([...headers, "Nova coluna"])}
            >
              + coluna
            </SmallButton>
            {rows.length > 0 && (
              <SmallButton onClick={() => setRows(rows.slice(0, -1))}>
                − linha
              </SmallButton>
            )}
          </BlockActions>
        </div>
      )
    },
  }
)
