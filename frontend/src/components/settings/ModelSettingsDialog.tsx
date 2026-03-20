import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { useSettings } from "../../hooks/useSettings";
import { settingsService } from "../../services/settings";
import type { SearchModel } from "../../services/settings";
import { cn } from "@/lib/utils";
import { CheckIcon, SearchIcon, Loader2Icon, SparklesIcon, ZapIcon, SlidersHorizontalIcon, LockIcon } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
type Tier = "standard" | "advanced" | "custom";

interface ModelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Component ──────────────────────────────────────────────────────────
export function ModelSettingsDialog({
  open,
  onOpenChange,
}: ModelSettingsDialogProps) {
  const {
    settings,
    isLoading,
    recommended,
    updateSettings,
    isUpdating,
    updateError,
    resetUpdateError,
    deleteApiKey,
    isDeletingKey,
  } = useSettings();

  // Local UI state
  const [activeTier, setActiveTier] = useState<Tier>("standard");
  const [apiKey, setApiKey] = useState("");
  const [customModelId, setCustomModelId] = useState<string | null>(null);
  const [customModelName, setCustomModelName] = useState<string | null>(null);

  // Search state for Custom tier
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine which tier the user's current model falls into
  const inferTier = useCallback(
    (modelId: string | null): Tier => {
      if (!modelId) return "standard";
      if (recommended?.standard.id === modelId) return "standard";
      if (recommended?.advanced.id === modelId) return "advanced";
      return "custom";
    },
    [recommended],
  );

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      resetUpdateError();
      setApiKey("");
      setSearchQuery("");
      setSearchResults([]);

      const currentModel = settings?.preferred_model ?? null;
      const tier = inferTier(currentModel);
      setActiveTier(tier);

      if (tier === "custom" && currentModel) {
        setCustomModelId(currentModel);
        // We only have the ID from settings; name will show as the ID
        setCustomModelName(currentModel);
      } else {
        setCustomModelId(null);
        setCustomModelName(null);
      }
    }
  }, [open, settings, recommended, inferTier, resetUpdateError]);

  // Whether the server has confirmed a stored BYOK key for this user.
  // Used for search gating — only server-confirmed keys unlock paid models.
  const hasByokKey = !!settings?.has_api_key;

  // Debounced search for Custom tier
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let stale = false;

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await settingsService.searchModels(
          searchQuery.trim(),
          !hasByokKey,
        );
        if (!stale) {
          setSearchResults(results);
        }
      } catch {
        if (!stale) {
          setSearchResults([]);
        }
      } finally {
        if (!stale) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => {
      stale = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, hasByokKey]);

  // Resolve the actual model ID that will be saved
  const resolveModelId = (): string | null => {
    if (activeTier === "standard") return recommended?.standard.id ?? null;
    if (activeTier === "advanced") return recommended?.advanced.id ?? null;
    if (activeTier === "custom") return customModelId;
    return null;
  };

  const handleSave = () => {
    const modelId = resolveModelId();
    updateSettings(
      {
        preferred_model: modelId,
        api_key: apiKey || undefined,
      },
      {
        onSuccess: () => {
          setApiKey("");
          onOpenChange(false);
        },
      },
    );
  };

  const handleRemoveKey = () => {
    deleteApiKey(undefined, {
      onSuccess: () => {
        setActiveTier("standard");
        setCustomModelId(null);
        setCustomModelName(null);
        setApiKey("");
      },
    });
  };

  const handleSelectCustomModel = (model: SearchModel) => {
    setCustomModelId(model.id);
    setCustomModelName(model.name);
    setSearchQuery("");
    setSearchResults([]);
  };

  if (isLoading) return null;

  const errorMessage = updateError
    ? (updateError as { message?: string }).message ?? String(updateError)
    : null;

  const hasKey = settings?.has_api_key || !!apiKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            Choose your AI model tier. Standard is included, or bring your own
            OpenRouter API key for premium and custom models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Error banner */}
          {errorMessage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {/* ── Tier cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Model tier">
            {/* Standard */}
            <TierCard
              active={activeTier === "standard"}
              onClick={() => setActiveTier("standard")}
              icon={<ZapIcon className="size-4" />}
              title="Standard"
              subtitle="Included"
              description={recommended?.standard.name ?? "Loading..."}
            />

            {/* Advanced */}
            <TierCard
              active={activeTier === "advanced"}
              onClick={() => setActiveTier("advanced")}
              icon={<SparklesIcon className="size-4" />}
              title="Advanced"
              subtitle="Premium"
              description={recommended?.advanced.name ?? "Loading..."}
              locked={!hasKey}
            />

            {/* Custom */}
            <TierCard
              active={activeTier === "custom"}
              onClick={() => setActiveTier("custom")}
              icon={<SlidersHorizontalIcon className="size-4" />}
              title="Custom"
              subtitle={hasByokKey ? "Any model" : "Included models"}
              description={
                customModelName
                  ? customModelName.length > 20
                    ? customModelName.slice(0, 18) + "..."
                    : customModelName
                  : "Search..."
              }
            />
          </div>

          {/* ── Tier detail panel ───────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-background p-3">
            {activeTier === "standard" && (
              <div className="space-y-1">
                <p className="text-sm font-medium">{recommended?.standard.name}</p>
                <p className="text-xs text-text-tertiary">
                  {recommended?.standard.description ?? "High-quality free model -- no API key needed"}
                </p>
              </div>
            )}

            {activeTier === "advanced" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{recommended?.advanced.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {recommended?.advanced.description ?? "Premium model -- requires your own API key"}
                  </p>
                </div>
                {!settings?.has_api_key && !apiKey && (
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="mb-1.5 text-xs text-text-tertiary">
                      Enter your OpenRouter API key to use premium models
                    </p>
                    <Input
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            )}

            {activeTier === "custom" && (
              <div className="space-y-2">
                {customModelId && (
                  <div className="flex items-center justify-between rounded-md border border-interactive-focus/30 bg-interactive-focus-bg px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{customModelName}</p>
                      <p className="truncate text-xs text-text-tertiary">{customModelId}</p>
                    </div>
                    <button
                      type="button"
                      className="ml-2 shrink-0 text-xs text-text-tertiary underline hover:text-text-primary"
                      onClick={() => {
                        setCustomModelId(null);
                        setCustomModelName(null);
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}

                {!customModelId && (
                  <>
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-placeholder" />
                      <Input
                        aria-label="Search OpenRouter models"
                        placeholder="Search OpenRouter models..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 text-sm"
                      />
                      {isSearching && (
                        <Loader2Icon className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-text-placeholder" />
                      )}
                    </div>

                    {searchResults.length > 0 && (
                      <ScrollArea className="max-h-48 overflow-y-auto rounded-md border border-border">
                        <div className="divide-y divide-border">
                          {searchResults.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] hover:bg-interactive-fill"
                              onClick={() => handleSelectCustomModel(model)}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{model.name}</p>
                                <p className="truncate text-xs text-text-tertiary">
                                  {model.provider}
                                  {model.context_length
                                    ? ` -- ${Math.round(model.context_length / 1000)}k context`
                                    : ""}
                                </p>
                              </div>
                              {model.is_free ? (
                                <span className="mt-0.5 shrink-0 rounded-sm bg-interactive-fill px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                                  Included
                                </span>
                              ) : (
                                <span className="mt-0.5 shrink-0 rounded-sm bg-border px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">
                                  BYOK
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    )}

                    {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                      <p className="px-1 text-xs text-text-tertiary">No models found</p>
                    )}
                  </>
                )}

                {!settings?.has_api_key && !apiKey && (
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="mb-1.5 text-xs text-text-tertiary">
                      Most custom models require an API key
                    </p>
                    <Input
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── API Key section (when key already set) ──────────────── */}
          <div>
            <span className="text-section text-text-tertiary">
              OpenRouter API Key
            </span>
            {settings?.has_api_key ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  Key ending in ...{settings.key_hint ?? "****"}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveKey}
                  disabled={isDeletingKey}
                >
                  Remove
                </Button>
              </div>
            ) : !apiKey ? (
              <p className="mt-1 text-xs text-text-tertiary">
                No key set.{" "}
                {activeTier === "standard"
                  ? "Not needed for the Standard tier."
                  : "Enter a key above or select Standard (included)."}
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-tertiary">
                Key will be validated and stored on save.
              </p>
            )}
            <p className="mt-1 text-xs text-text-tertiary">
              Get your key at{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-interactive-focus underline"
              >
                openrouter.ai/keys
              </a>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isUpdating ||
              !recommended ||
              (activeTier === "custom" && !customModelId) ||
              (activeTier === "advanced" && !hasKey)
            }
          >
            {isUpdating ? "Validating..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tier card sub-component ────────────────────────────────────────────
function TierCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  description,
  locked = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)]",
        active
          ? "border-interactive-focus bg-interactive-focus-bg"
          : "border-border hover:bg-interactive-fill",
        locked && !active && "opacity-60",
      )}
    >
      {active && !locked && (
        <CheckIcon className="absolute right-2 top-2 size-3.5 text-interactive-focus" />
      )}
      {locked && (
        <LockIcon className="absolute right-2 top-2 size-3.5 text-text-tertiary" aria-label="Requires API key" />
      )}
      <div className="flex items-center gap-1.5 text-text-secondary">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
        {subtitle}
      </span>
      <span className="mt-auto text-xs text-text-tertiary">{description}</span>
    </button>
  );
}
