import { Search, X } from "lucide-react";
import { useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search..." }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2.5 h-3.5 w-3.5 text-text-placeholder pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search analysis results"
        className="h-8 w-full sm:w-52 rounded-lg border border-border bg-transparent pl-8 pr-8 text-ui text-foreground placeholder:text-text-placeholder transition-[border-color] duration-[var(--duration-micro)] ease-[var(--ease)] focus:outline-none focus:border-interactive-focus focus:ring-[var(--ring-width)] focus:ring-interactive-focus-bg"
      />
      {value && (
        <button
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
          aria-label="Clear search"
          className="absolute right-2 p-0.5 text-text-placeholder hover:text-text-secondary rounded"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
