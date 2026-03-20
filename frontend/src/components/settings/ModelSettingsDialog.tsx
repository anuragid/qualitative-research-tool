import { useEffect, useState } from "react";
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
import { useSettings } from "../../hooks/useSettings";
import { LockIcon } from "lucide-react";

interface ModelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelSettingsDialog({
  open,
  onOpenChange,
}: ModelSettingsDialogProps) {
  const {
    settings,
    isLoading,
    updateSettings,
    isUpdating,
    updateError,
    resetUpdateError,
    deleteApiKey,
    isDeletingKey,
  } = useSettings();

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      resetUpdateError();
      setApiKey("");
      setSelectedModel(null);
    }
  }, [open, resetUpdateError]);

  const currentModel = selectedModel ?? settings?.preferred_model ?? null;

  // Separate standard (included) from premium models
  const standardModels =
    settings?.available_models.filter((m) => m.tier === "standard") ?? [];

  const hasKey = settings?.has_api_key || !!apiKey;

  const handleSave = () => {
    updateSettings(
      {
        preferred_model: currentModel,
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
        setSelectedModel(null);
        setApiKey("");
      },
    });
  };

  if (isLoading) return null;

  const errorMessage = updateError
    ? (updateError as { message?: string }).message ?? String(updateError)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            Standard models are included. Bring your own OpenRouter API key to
            use any premium model.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Error banner */}
          {errorMessage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {/* Model selection */}
          <RadioGroup
            value={currentModel || standardModels[0]?.id || ""}
            onValueChange={(value) => setSelectedModel(value)}
            className="gap-4"
          >
            {/* Standard models */}
            <div>
              <span className="text-section text-text-tertiary">
                Standard Models
              </span>
              <p className="mt-0.5 text-xs text-text-tertiary">
                Included -- no API key needed
              </p>
              <div className="mt-2 space-y-2">
                {standardModels.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                      currentModel === model.id ||
                      (!currentModel && model === standardModels[0])
                        ? "border-interactive-focus bg-interactive-focus-bg"
                        : "border-border hover:bg-interactive-fill"
                    }`}
                  >
                    <RadioGroupItem value={model.id} />
                    <div>
                      <div className="font-medium text-sm">{model.name}</div>
                      <div className="text-xs text-text-tertiary">
                        {model.provider ?? "Open source"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Premium section */}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-section text-text-tertiary">
                  Premium Models
                </span>
                {!hasKey && (
                  <LockIcon className="size-3 text-text-tertiary" />
                )}
              </div>
              <p className="mt-0.5 text-xs text-text-tertiary">
                Bring your own OpenRouter API key to use any model
              </p>
              {hasKey ? (
                <div className="mt-2">
                  <Input
                    placeholder="Enter any OpenRouter model ID (e.g. anthropic/claude-sonnet-4.6)"
                    value={
                      selectedModel && !standardModels.some((m) => m.id === selectedModel)
                        ? selectedModel
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val) setSelectedModel(val);
                    }}
                    className="h-9 text-sm font-mono"
                  />
                  <p className="mt-1 text-xs text-text-tertiary">
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
              ) : (
                <p className="mt-2 text-xs text-text-placeholder">
                  Add your API key below to unlock premium models.
                </p>
              )}
            </div>
          </RadioGroup>

          {/* API Key */}
          <div>
            <span className="text-section text-text-tertiary">
              OpenRouter API Key (BYOK)
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
            ) : (
              <Input
                id="api-key"
                type="password"
                placeholder="sk-or-v1-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-2"
              />
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
          <Button onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? "Validating..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
