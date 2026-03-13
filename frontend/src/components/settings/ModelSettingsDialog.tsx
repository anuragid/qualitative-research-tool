import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
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
    updateSettings({
      preferred_model: currentModel,
      api_key: apiKey || undefined,
    });
    setApiKey("");
    onOpenChange(false);
  };

  const handleRemoveKey = () => {
    deleteApiKey();
    setSelectedModel(null);
    setApiKey("");
  };

  if (isLoading) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            Choose your AI model. Free models work for everyone. Bring your own
            OpenRouter API key for premium models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Free models */}
          <div>
            <Label className="text-sm font-medium">Free Models</Label>
            <div className="mt-2 space-y-2">
              {freeModels.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    currentModel === model.id || (!currentModel && model === freeModels[0])
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={currentModel === model.id || (!currentModel && model === freeModels[0])}
                    onChange={() => setSelectedModel(model.id)}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-muted-foreground">Free tier</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Premium models */}
          <div>
            <Label className="text-sm font-medium">
              Premium Models (requires API key)
            </Label>
            <div className="mt-2 space-y-2">
              {premiumModels.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    currentModel === model.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-border/80"
                  } ${!settings?.has_api_key && !apiKey ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={currentModel === model.id}
                    onChange={() => setSelectedModel(model.id)}
                    disabled={!settings?.has_api_key && !apiKey}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Premium - BYOK required
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <Label htmlFor="api-key" className="text-sm font-medium">
              OpenRouter API Key
            </Label>
            {settings?.has_api_key ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  API key configured
                </div>
                <Button
                  variant="outline"
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
            <p className="mt-1 text-xs text-muted-foreground">
              Get your key at{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                openrouter.ai/keys
              </a>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
