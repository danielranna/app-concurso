"use client"

import Link from "next/link"

type LinkItem = {
  href: string
  label: string
  exact?: boolean
}

type Props = {
  links: LinkItem[]
  isActive: (href: string, exact?: boolean) => boolean
  className?: string
}

export default function ScrollableSubNav({ links, isActive, className = "" }: Props) {
  return (
    <nav className={`-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
      <div className="flex w-max min-w-full gap-1 rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm shadow-slate-200/40">
        {links.map(({ href, label, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
