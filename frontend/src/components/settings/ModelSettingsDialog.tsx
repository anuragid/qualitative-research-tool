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

type SelectedTier = "included" | "byok";

interface ModelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The default standard model selected when falling back to included tier.
 */
const DEFAULT_STANDARD_MODEL = "meta-llama/llama-4-scout";

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

  const [selectedTier, setSelectedTier] = useState<SelectedTier>("included");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const { results, isSearching, query, setQuery } = useModelSearch();

  const standardModels =
    settings?.available_models?.filter((m) => m.tier === "standard") ?? [];

  // ── Reset on open ────────────────────────────────────────────────────
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

    // Derive initial tier from settings.model_tier (falls back to "included")
    const tier: SelectedTier =
      (settings as Record<string, unknown>).model_tier === "byok" ? "byok" : "included";
    setSelectedTier(tier);
    setPendingModel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings]);

  if (isLoading || !settings) return null;

  // ── Derived values ──────────────────────────────────────────────────
  const savedModel = settings.preferred_model;

  const byokDisplayModel = selectedTier === "byok"
    ? (pendingModel ?? (!isStandardId(savedModel, settings) ? savedModel : null))
    : null;

  const isDirty = (() => {
    if (pendingModel != null) return true;
    const savedTier = (settings as Record<string, unknown>).model_tier ?? "included";
    return selectedTier !== savedTier;
  })();

  // Save blocked conditions
  const byokNoKey = selectedTier === "byok" && !settings.has_api_key;
  const byokNoCredits =
    selectedTier === "byok" &&
    settings.has_api_key &&
    settings.balance != null &&
    !settings.balance.has_credits;
  const saveDisabled = !isDirty || isUpdatingModel || byokNoKey || byokNoCredits;

  // ── Handlers ────────────────────────────────────────────────────────
  const handleIncludedPick = (id: string) => {
    setSelectedTier("included");
    setPendingModel(id);
    resetUpdateModelError();
  };

  const handleByokPick = (model: SearchModel | null) => {
    if (!model) return;
    setSelectedTier("byok");
    setPendingModel(model.id);
    resetUpdateModelError();
  };

  const handleAddKey = async () => {
    if (apiKeyDraft.length < 10) return;
    try {
      await addApiKey(apiKeyDraft);
      setApiKeyDraft("");
    } catch {
      // addKeyError is set by the mutation
    }
  };

  const handleRemoveKey = async () => {
    try {
      await deleteApiKey();
      setSelectedTier("included");
      setPendingModel(DEFAULT_STANDARD_MODEL);
      setApiKeyDraft("");
    } catch {
      // surfaced via deleteKeyError
    }
  };

  const handleSave = async () => {
    if (saveDisabled) {
      onOpenChange(false);
      return;
    }

    const modelToSave =
      selectedTier === "included"
        ? pendingModel ?? savedModel ?? DEFAULT_STANDARD_MODEL
        : pendingModel ?? savedModel ?? "";

    try {
      await updatePreferredModel({
        modelId: modelToSave,
        modelTier: selectedTier,
      });
      onOpenChange(false);
    } catch {
      // updateModelError is set; user retries
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  const addKeyErrorMessage = addKeyError
    ? extractErrorDetail(addKeyError, "Could not save the API key.")
    : null;
  const updateModelErrorMessage = updateModelError
    ? extractErrorDetail(updateModelError, "Could not update the model.")
    : null;
  const deleteKeyErrorMessage = deleteKeyError
    ? extractErrorDetail(deleteKeyError, "Could not remove the API key.")
    : null;

  // Radio group value: only set when tier is "included"
  const radioValue = selectedTier === "included" ? (pendingModel ?? savedModel ?? "") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            Choose which model to use for analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          {/* ── INCLUDED SECTION ──────────────────────────────────── */}
          <div data-testid="included-section">
            <h3 className="mb-3 text-sm font-semibold text-text-secondary">
              Included
            </h3>
            <RadioGroup
              value={radioValue}
              onValueChange={handleIncludedPick}
              className="flex flex-col gap-2"
            >
              {standardModels.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                    radioValue === model.id
                      ? "border-interactive-focus bg-interactive-focus-bg"
                      : "border-border hover:bg-interactive-fill"
                  }`}
                >
                  <RadioGroupItem
                    value={model.id}
                    aria-label={model.name}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-text-tertiary">
                      {model.provider ?? "Open source"}
                    </div>
                  </div>
                  <span className="text-xs text-success font-medium">Free</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* ── BYOK SECTION ─────────────────────────────────────── */}
          <div
            data-testid="byok-section"
            className={`${selectedTier !== "byok" ? "opacity-75" : ""}`}
          >
            <h3 className="mb-3 text-sm font-semibold text-text-secondary">
              Bring Your Own Key
            </h3>
            <p className="mb-3 text-xs text-text-tertiary">
              Use any model from OpenRouter with your own API key.
            </p>

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

                {deleteKeyErrorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {deleteKeyErrorMessage}
                  </div>
                )}

                <BalanceDisplay
                  balance={settings.balance ?? null}
                  onRefresh={() => {
                    void refreshBalance().catch(() => {});
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
                    {byokDisplayModel ?? "\u2014"}
                  </div>
                </div>

                <Combobox<SearchModel>
                  items={results}
                  filteredItems={results}
                  filter={null}
                  itemToStringLabel={(m) => m?.name ?? ""}
                  itemToStringValue={(m) => m?.id ?? ""}
                  inputValue={query}
                  onInputValueChange={setQuery}
                  onValueChange={handleByokPick}
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
          </div>

          {/* Included-tier update error (shown outside the sections) */}
          {selectedTier === "included" && updateModelErrorMessage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {updateModelErrorMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {isUpdatingModel ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
