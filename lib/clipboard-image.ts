/** Extrai imagem do clipboard (print, Snipping Tool, etc.) — funciona com files e items. */
export function getImageFileFromClipboard(
  clipboardData: DataTransfer | null
): File | null {
  if (!clipboardData) return null

  for (let i = 0; i < clipboardData.files.length; i++) {
    const file = clipboardData.files[i]
    if (file?.type.startsWith("image/")) return file
  }

  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i]
    if (!item?.type.startsWith("image/")) continue
    const blob = item.getAsFile()
    if (blob) {
      const mime = blob.type || "image/png"
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "png"
      const name =
        blob.name && blob.name !== "image.png" ? blob.name : `paste-${Date.now()}.${ext}`
      if (blob instanceof File) return blob
      return new File([blob], name, { type: mime })
    }
  }

  return null
}

export function getImageFileFromPasteEvent(
  e: React.ClipboardEvent | ClipboardEvent
): File | null {
  return getImageFileFromClipboard(e.clipboardData)
}
