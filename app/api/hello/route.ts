import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    message: "Olá do backend Node (Next.js)",
    status: "ok"
  })
}
