import { useState } from "react";
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
    deleteApiKey,
    isDeletingKey,
  } = useSettings();

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const freeModels =
    settings?.available_models.filter((m) => m.tier === "free") ?? [];
  const premiumModels =
    settings?.available_models.filter((m) => m.tier === "premium") ?? [];

  const currentModel = selectedModel ?? settings?.preferred_model ?? null;

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
    deleteApiKey();
    setSelectedModel(null);
    setApiKey("");
  };

  if (isLoading) return null;

  const errorMessage = updateError
    ? (updateError as { message?: string }).message ??
      (updateError instanceof Error ? updateError.message : String(updateError))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            Choose your AI model. Open-source models work for everyone. Bring
            your own OpenRouter API key for premium models.
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
            value={currentModel || freeModels[0]?.id || ""}
            onValueChange={(value) => setSelectedModel(value)}
            className="gap-4"
          >
            {/* Free models */}
            <div>
              <span className="text-section text-text-tertiary">
                Open Source Models
              </span>
              <div className="mt-2 space-y-2">
                {freeModels.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                      currentModel === model.id ||
                      (!currentModel && model === freeModels[0])
                        ? "border-interactive-focus bg-interactive-focus-bg"
                        : "border-border hover:bg-interactive-fill"
                    }`}
                  >
                    <RadioGroupItem value={model.id} />
                    <div>
                      <div className="font-medium text-sm">{model.name}</div>
                      <div className="text-xs text-text-tertiary">
                        Free -- good for drafts and exploration
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Premium models */}
            <div>
              <span className="text-section text-text-tertiary">
                Premium Models
              </span>
              <div className="mt-2 space-y-2">
                {premiumModels.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] ${
                      currentModel === model.id
                        ? "border-interactive-focus bg-interactive-focus-bg cursor-pointer"
                        : "border-border hover:bg-interactive-fill cursor-pointer"
                    } ${!settings?.has_api_key && !apiKey ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <RadioGroupItem
                      value={model.id}
                      disabled={!settings?.has_api_key && !apiKey}
                    />
                    <div>
                      <div className="font-medium text-sm">{model.name}</div>
                      <div className="text-xs text-text-tertiary">
                        {!settings?.has_api_key && !apiKey
                          ? "Add your API key in Settings to unlock"
                          : "Higher quality analysis -- uses your API key"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
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
