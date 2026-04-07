import { useEffect, useRef, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "../ui/combobox";
import { useSettings } from "../../hooks/useSettings";
import { useModelSearch } from "../../hooks/useModelSearch";
import { ModelOption } from "./ModelOption";
import { BalanceDisplay } from "./BalanceDisplay";
import { LoaderIcon } from "lucide-react";
import type { SearchModel, UserSettings } from "../../services/settings";
import { extractErrorDetail } from "../../lib/parseError";

type Mode = "standard" | "premium";

interface ModelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The default premium model selected when a user enters Premium mode without
 * an existing premium pick. Latest Anthropic Sonnet on OpenRouter as of 2026-04.
 */
const DEFAULT_PREMIUM_MODEL = "anthropic/claude-sonnet-4.6";

function isStandardId(id: string | null | undefined, settings: UserSettings | undefined): boolean {
  if (!id || !settings?.available_models) return false;
  return settings.available_models.some((m) => m.id === id && m.tier === "standard");
}

export function ModelSettingsDialog({
  open,
  onOpenChange,
}: ModelSettingsDialogProps) {
  const {
    settings,
    isLoading,
    addApiKey,
    isAddingKey,
    addKeyError,
    resetAddKeyError,
    updatePreferredModel,
    isUpdatingModel,
    updateModelError,
    resetUpdateModelError,
    deleteApiKey,
    isDeletingKey,
    deleteKeyError,
    resetDeleteKeyError,
    refreshBalance,
    isRefreshingBalance,
  } = useSettings();

  const [mode, setMode] = useState<Mode>("standard");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const { results, isSearching, query, setQuery } = useModelSearch();

  const standardModels =
    settings?.available_models?.filter((m) => m.tier === "standard") ?? [];

  // ── Reset on open ────────────────────────────────────────────────────
  // Initialize the dialog state ONCE per "open=true session". The ref
  // guard ensures that background `["user-settings"]` refetches do not
  // re-derive `mode` or clobber `pendingModel` mid-session — they only
  // update the cached settings the dialog reads from.
  //
  // Mode rule: presence of an API key is the binary toggle.
  //   has_api_key === true  → Premium (Standard tab disabled)
  //   has_api_key === false → Standard (Premium tab opens the add-key form)
  // To go back to Standard once you've added a key you must remove it.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current || !settings) return;
    initializedRef.current = true;
    setApiKeyDraft("");
    setQuery("");
    resetAddKeyError();
    resetUpdateModelError();
    resetDeleteKeyError();

    const initialMode: Mode = settings.has_api_key ? "premium" : "standard";
    setMode(initialMode);

    // If we're entering Premium and the saved model is null or a standard
    // model (i.e. user just validated their key but never picked a premium
    // model), pre-populate `pendingModel` with the latest Anthropic Sonnet
    // so the Save button is dirty and a single click commits a sane default.
    if (initialMode === "premium") {
      const savedIsPremium =
        settings.preferred_model != null &&
        !isStandardId(settings.preferred_model, settings);
      setPendingModel(savedIsPremium ? null : DEFAULT_PREMIUM_MODEL);
    } else {
      setPendingModel(null);
    }
    // We intentionally exclude the reset/setQuery callbacks from deps —
    // they're stable identities from the hook and including them would
    // not change behavior given the ref guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings]);

  // If has_api_key flips true mid-session (e.g. via the add-key flow or a
  // background refetch from another tab) while the dialog is showing the
  // Standard tab, auto-switch to Premium since Standard is now disabled.
  useEffect(() => {
    if (!open || !settings) return;
    if (settings.has_api_key && mode === "standard") {
      setMode("premium");
      // Pre-pop the default if their saved model isn't already premium.
      if (!settings.preferred_model || isStandardId(settings.preferred_model, settings)) {
        setPendingModel(DEFAULT_PREMIUM_MODEL);
      }
    }
  }, [open, settings, mode]);

  if (isLoading || !settings) return null;

  // ── Derived values (no local mirrors of saved state) ─────────────────
  const effectiveModel = pendingModel ?? settings.preferred_model;
  const isDirty =
    pendingModel != null && pendingModel !== settings.preferred_model;

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleModeChange = (next: string) => {
    // Once a key is on file, Standard is unreachable until the user removes
    // the key. Belt-and-suspenders alongside the disabled tab trigger.
    if (next === "standard" && settings.has_api_key) return;
    setMode(next as Mode);
    setPendingModel(null);
    setQuery("");
    resetAddKeyError();
    resetUpdateModelError();
  };

  const handleStandardPick = (id: string) => {
    setPendingModel(id);
    resetUpdateModelError();
  };

  const handlePremiumPick = (model: SearchModel | null) => {
    if (!model) return;
    setPendingModel(model.id);
    resetUpdateModelError();
  };

  const handleAddKey = async () => {
    if (apiKeyDraft.length < 10) return;
    try {
      const updated = await addApiKey(apiKeyDraft);
      setApiKeyDraft("");
      // After validating, default to the latest Anthropic Sonnet if their
      // saved model is null or still a standard one. The user is committing
      // to premium by adding a key — a sensible default makes Save one click.
      if (!updated.preferred_model || isStandardId(updated.preferred_model, updated)) {
        setPendingModel(DEFAULT_PREMIUM_MODEL);
      }
    } catch {
      // addKeyError is set by the mutation; the inline error renders it.
    }
  };

  const handleRemoveKey = async () => {
    try {
      await deleteApiKey();
      setMode("standard");
      setPendingModel(null);
      setApiKeyDraft("");
    } catch {
      // surfaced via deleteKeyError inline error message
    }
  };

  const handleSave = async () => {
    if (!isDirty || pendingModel == null) {
      onOpenChange(false);
      return;
    }
    try {
      await updatePreferredModel(pendingModel);
      onOpenChange(false);
    } catch {
      // updateModelError is set; user retries
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  const addKeyErrorMessage = addKeyError
    ? extractErrorDetail(addKeyError, "Could not save the API key.")
    : null;
  const updateModelErrorMessage = updateModelError
    ? extractErrorDetail(updateModelError, "Could not update the model.")
    : null;
  const deleteKeyErrorMessage = deleteKeyError
    ? extractErrorDetail(deleteKeyError, "Could not remove the API key.")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            Choose between the included standard models, or bring your own
            OpenRouter key to use any premium model.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={handleModeChange} className="py-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="standard"
              disabled={settings.has_api_key}
              title={
                settings.has_api_key
                  ? "Remove your OpenRouter key to use a standard model"
                  : undefined
              }
            >
              Standard
            </TabsTrigger>
            <TabsTrigger value="premium">Premium</TabsTrigger>
          </TabsList>

          {/* ── STANDARD MODE ───────────────────────────────────────── */}
          <TabsContent value="standard" className="mt-4">
            <RadioGroup
              value={effectiveModel ?? ""}
              onValueChange={handleStandardPick}
              className="flex flex-col gap-2"
            >
              {standardModels.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                    effectiveModel === model.id
                      ? "border-interactive-focus bg-interactive-focus-bg"
                      : "border-border hover:bg-interactive-fill"
                  }`}
                >
                  <RadioGroupItem
                    value={model.id}
                    aria-label={model.name}
                  />
                  <div>
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-text-tertiary">
                      {model.provider ?? "Open source"}
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>

            {updateModelErrorMessage && (
              <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {updateModelErrorMessage}
              </div>
            )}

            {settings.has_api_key && (
              <>
                {deleteKeyErrorMessage && (
                  <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {deleteKeyErrorMessage}
                  </div>
                )}
                <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-text-tertiary">
                  OpenRouter key on file (ending …{settings.key_hint ?? "****"}).{" "}
                  <button
                    type="button"
                    className="underline hover:text-text-secondary"
                    onClick={handleRemoveKey}
                    disabled={isDeletingKey}
                  >
                    Remove key
                  </button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── PREMIUM MODE ───────────────────────────────────────── */}
          <TabsContent value="premium" className="mt-4">
            {!settings.has_api_key ? (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="api-key-input"
                  className="text-section text-text-tertiary"
                >
                  OpenRouter API Key
                </label>
                <Input
                  id="api-key-input"
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  minLength={10}
                  maxLength={500}
                />
                <p className="text-xs text-text-tertiary">
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
                {addKeyErrorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {addKeyErrorMessage}
                    {/* Heuristic: detect any "credits" wording in the error to surface the
                        Add Credits CTA. The backend's /api-key route only emits two distinct
                        400 messages — the unreachable/invalid case and the no-credits case —
                        so a credits-shaped substring is a reliable proxy until the backend
                        adopts a structured detail payload. */}
                    {/(\$0 credits|\bno credits\b|\bzero credits\b|\binsufficient credits\b)/i.test(addKeyErrorMessage) && (
                      <a
                        href="https://openrouter.ai/settings/credits"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-interactive-focus underline"
                      >
                        Add credits on OpenRouter
                      </a>
                    )}
                  </div>
                )}
                <Button
                  onClick={handleAddKey}
                  disabled={apiKeyDraft.length < 10 || isAddingKey}
                  className="w-fit"
                >
                  {isAddingKey ? "Validating..." : "Validate & Save Key"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                    Key ending in …{settings.key_hint ?? "****"}
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

                {deleteKeyErrorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {deleteKeyErrorMessage}
                  </div>
                )}

                <BalanceDisplay
                  balance={settings.balance ?? null}
                  onRefresh={() => {
                    void refreshBalance().catch(() => {
                      // surfaced by stale flag in the component
                    });
                  }}
                  isRefreshing={isRefreshingBalance}
                  lowThresholdUsd={settings.low_balance_threshold_usd ?? 0.5}
                />

                <div
                  data-testid="selected-model-display"
                  className="rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="text-xs text-text-tertiary">
                    Selected model
                  </div>
                  <div className="mt-0.5 font-mono text-sm text-foreground break-all">
                    {effectiveModel ?? "—"}
                  </div>
                </div>

                <Combobox<SearchModel>
                  items={results}
                  filteredItems={results}
                  filter={null}
                  itemToStringLabel={(m) => m?.name ?? ""}
                  itemToStringValue={(m) => m?.id ?? ""}
                  // The combobox is purely a search-and-pick surface; the
                  // currently-selected model lives in `pendingModel` /
                  // `effectiveModel` and is shown in the "Selected model"
                  // row above. Controlling `value` from `effectiveModel`
                  // would resync the input on every keystroke and clobber
                  // typing, so we leave `value` uncontrolled and only
                  // control `inputValue` (the search query).
                  inputValue={query}
                  onInputValueChange={setQuery}
                  onValueChange={handlePremiumPick}
                >
                  <ComboboxInput placeholder="Search models..." />
                  <ComboboxContent>
                    <ComboboxEmpty>
                      <span className="flex items-center gap-2">
                        {isSearching && (
                          <LoaderIcon className="size-3.5 animate-spin" />
                        )}
                        {isSearching
                          ? "Searching..."
                          : query.length < 2
                            ? "Type to search models"
                            : "No models found"}
                      </span>
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(model) => (
                        <ComboboxItem key={model.id} value={model}>
                          <ModelOption
                            name={model.name}
                            provider={model.provider}
                            isFree={model.is_free}
                            contextLength={model.context_length}
                          />
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>

                {updateModelErrorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {updateModelErrorMessage}
                  </div>
                )}

                <p className="text-xs text-text-tertiary">
                  Browse models at{" "}
                  <a
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-interactive-focus underline"
                  >
                    openrouter.ai/models
                  </a>
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || isUpdatingModel}
          >
            {isUpdatingModel ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
