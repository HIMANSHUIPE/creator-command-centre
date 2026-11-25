import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import clsx from 'clsx'
import { LayoutDashboard, Library, Sparkles, CalendarDays, Handshake, FileBarChart, Settings, Menu, X, LogOut, FlaskConical, Lightbulb, TrendingUp } from 'lucide-react'
import { Instagram, Youtube } from './icons'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/instagram', label: 'Instagram Analytics', icon: Instagram },
  { to: '/youtube', label: 'YouTube Analytics', icon: Youtube },
  { to: '/content', label: 'Content Library', icon: Library },
  { to: '/growth', label: 'Growth Intelligence', icon: TrendingUp },
  { to: '/strategist', label: 'AI Strategist', icon: Sparkles },
  { to: '/ideas', label: 'Idea Generator', icon: Lightbulb },
  { to: '/calendar', label: 'Content Calendar', icon: CalendarDays },
  { to: '/brands', label: 'Brand Collaborations', icon: Handshake },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings & Integrations', icon: Settings },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition', isActive ? 'bg-white font-medium text-ink shadow-card ring-1 ring-line' : 'text-ink-soft hover:bg-stone-200/50 hover:text-ink')}>
          <Icon size={16} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 px-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">
        <svg viewBox="0 0 32 32" width="18" height="18"><path d="M7 22l6-7 4 4 8-10" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="text-sm font-semibold tracking-tight">Command Centre</span>
    </Link>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { session, signOut, demoGuest } = useAuth()
  const { isDemo, hasLive } = useData()

  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-[#F5F3EF] p-3 lg:flex">
        <div className="py-2"><Brand /></div>
        <div className="mt-4 flex-1 overflow-y-auto"><Nav /></div>
        <div className="border-t border-line pt-3">
          <div className="truncate px-2 text-xs text-ink-mute">{demoGuest ? 'Guest (demo)' : session?.user.email}</div>
          <button onClick={signOut} className="btn-ghost mt-1 w-full justify-start px-2 text-xs"><LogOut size={14} />Sign out</button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 bg-[#F5F3EF] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between py-2"><Brand /><button className="btn-ghost p-1.5" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="mt-4"><Nav onNavigate={() => setOpen(false)} /></div>
            <button onClick={signOut} className="btn-ghost mt-4 w-full justify-start px-2 text-xs"><LogOut size={14} />Sign out</button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button className="btn-ghost p-1.5" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <Brand />
        </header>
        {isDemo && (
          <div className="no-print flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
            <FlaskConical size={14} />
            <span><strong>DEMO MODE.</strong> All numbers below are sample data, not your real accounts.</span>
            {!demoGuest && (
              <Link to="/settings" className="font-medium underline underline-offset-2">{hasLive ? 'Switch to live data' : 'Connect Instagram or YouTube'}</Link>
            )}
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
