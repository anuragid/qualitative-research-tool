import { useState, useEffect, useRef, useCallback } from "react";
import { settingsService, type SearchModel } from "../services/settings";

interface UseModelSearchReturn {
  results: SearchModel[];
  isSearching: boolean;
  query: string;
  setQuery: (q: string) => void;
}

export function useModelSearch(debounceMs = 300): UseModelSearchReturn {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();

      if (q.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const data = await settingsService.searchModels(q);
          if (!controller.signal.aborted) {
            setResults(data);
          }
        } catch {
          if (!controller.signal.aborted) {
            setResults([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      }, debounceMs);
    },
    [debounceMs]
  );

  useEffect(() => {
    search(query);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query, search]);

  return { results, isSearching, query, setQuery };
}
