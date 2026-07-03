import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  BarChart3,
  Database,
  Download,
  FlaskConical,
  Home,
  TerminalSquare,
  Wand2,
} from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

function HealthBadge() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.get("/health")).data as { status: string; environment: string },
    refetchInterval: 15_000,
  });

  if (isLoading) return <span className="text-slate-500">checking backend…</span>;
  if (isError) return <span className="text-red-400">backend unreachable</span>;
  return (
    <span className="text-emerald-400">
      backend {data?.status} ({data?.environment})
    </span>
  );
}

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/datasets", label: "Datasets", icon: Database, end: false },
  { to: "/explore", label: "Explore", icon: TerminalSquare, end: false },
  { to: "/studio", label: "Studio", icon: Wand2, end: false },
  { to: "/charts", label: "Charts", icon: BarChart3, end: false },
  { to: "/stats", label: "Stats", icon: FlaskConical, end: false },
  { to: "/exports", label: "Exports", icon: Download, end: false },
];

export default function Layout() {
  const navigate = useNavigate();
  const email = useAuth((s) => s.email);
  const clear = useAuth((s) => s.clear);
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-56 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-5">
          <h1 className="text-xl font-bold tracking-tight">DataForge</h1>
          <p className="text-xs text-slate-500">data engineering &amp; analytics</p>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  isActive
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-slate-800 px-4 py-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-slate-400" title={email ?? ""}>
              {email}
            </span>
            <button
              onClick={() => {
                clear();
                navigate("/login", { replace: true });
              }}
              title="Sign out"
              className="text-slate-500 hover:text-slate-200"
            >
              <LogOut size={14} />
            </button>
          </div>
          <HealthBadge />
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  );
}
