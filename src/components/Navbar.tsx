import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Wand2, SlidersHorizontal, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function Navbar() {
  const { logout } = useAuth();
  const location = useLocation();

  return (
    <nav className="border-b bg-card">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <span className="font-semibold text-lg tracking-tight shrink-0">Tumble</span>
            <div className="flex gap-0.5 sm:gap-1 min-w-0">
              <Link
                to="/rewrite"
                className={cn(
                  'flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  location.pathname === '/rewrite'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Wand2 className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Rewrite</span>
              </Link>
              <Link
                to="/"
                className={cn(
                  'flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  location.pathname === '/'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Library</span>
              </Link>
              <Link
                to="/personalise"
                className={cn(
                  'flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  location.pathname === '/personalise'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Personalise</span>
              </Link>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
