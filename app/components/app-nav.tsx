import { Link, NavLink, Outlet, isRouteErrorResponse, useRouteError } from "react-router";

import { ThemeToggle } from "~/components/theme-toggle";
import { cn } from "~/lib/utils";

const links = [
  { to: "/planning", label: "Planning" },
  { to: "/categories", label: "Subcategories" },
  { to: "/tracking", label: "Tracking" },
  { to: "/dashboard", label: "Dashboard" },
];

export function AppNav({ wide = false }: { wide?: boolean }) {
  return (
    <header className="border-b bg-card">
      <div
        className={cn(
          "mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
          wide && "max-w-[1600px]",
        )}
      >
        <Link to="/planning" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">Budtrack</span>
          <span className="text-xs text-muted-foreground">zero-based budget</span>
        </Link>
        <div className="flex items-center gap-2">
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function PageShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      <AppNav wide={wide} />
      <main className={cn("mx-auto px-4 py-6", wide ? "max-w-[1600px]" : "max-w-7xl")}>
        {children}
      </main>
    </div>
  );
}

export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <PageShell>
        <h1 className="text-2xl font-semibold">
          {error.status} {error.statusText}
        </h1>
        <p className="mt-2 text-muted-foreground">{error.data}</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <pre className="mt-4 overflow-auto rounded-md border bg-card p-4 text-xs">
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </PageShell>
  );
}
