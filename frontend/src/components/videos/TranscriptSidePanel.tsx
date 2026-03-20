import { useState } from "react";
import { TranscriptViewer } from "./TranscriptViewer";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  User,
  Edit2,
  Check,
  X,
  Users,
  FileText,
} from "lucide-react";
import type { Transcript, SpeakerLabel } from "../../types";

interface TranscriptSidePanelProps {
  transcript: Transcript;
  speakerLabels?: SpeakerLabel[];
  videoId: string;
  // Speaker editing state & handlers
  editingSpeaker: string | null;
  setEditingSpeaker: (speaker: string | null) => void;
  speakerName: string;
  setSpeakerName: (name: string) => void;
  speakerRole: string;
  setSpeakerRole: (role: string) => void;
  onLabelSpeaker: (speakerLabel: string, name: string, role?: string) => void;
  uniqueSpeakers: string[];
}

function SpeakerRoleEditor({
  uniqueSpeakers,
  speakerLabels,
  editingSpeaker,
  setEditingSpeaker,
  speakerName,
  setSpeakerName,
  speakerRole,
  setSpeakerRole,
  onLabelSpeaker,
}: Pick<
  TranscriptSidePanelProps,
  | "uniqueSpeakers"
  | "speakerLabels"
  | "editingSpeaker"
  | "setEditingSpeaker"
  | "speakerName"
  | "setSpeakerName"
  | "speakerRole"
  | "setSpeakerRole"
  | "onLabelSpeaker"
>) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (uniqueSpeakers.length === 0) return null;

  const allRolesAssigned = uniqueSpeakers.every(speaker => {
    const label = speakerLabels?.find((l) => l.speaker_label === speaker);
    return label?.role === "Interviewer" || label?.role === "Participant";
  });

  // Compact summary when all roles assigned
  if (allRolesAssigned && !editingSpeaker && !isExpanded) {
    return (
      <div className="border-b border-border px-3 py-1.5 flex-shrink-0">
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-1.5 w-full text-left hover:bg-interactive-fill rounded px-1 py-0.5 transition-colors cursor-pointer"
        >
          <Users className="h-3 w-3 text-text-placeholder flex-shrink-0" />
          <span className="text-[11px] text-text-tertiary truncate">
            {uniqueSpeakers.map(s => {
              const label = speakerLabels?.find(l => l.speaker_label === s);
              return `${label?.assigned_name || s}: ${label?.role}`;
            }).join(" · ")}
          </span>
          <Edit2 className="h-2.5 w-2.5 text-text-placeholder flex-shrink-0 ml-auto" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-border px-3 py-2 space-y-1.5 flex-shrink-0">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold text-text-secondary flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          Speakers ({uniqueSpeakers.length})
        </h4>
        {allRolesAssigned && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => { setIsExpanded(false); setEditingSpeaker(null); }}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        {uniqueSpeakers.map((speaker) => {
          const label = speakerLabels?.find((l) => l.speaker_label === speaker);
          const hasRole = label?.role === "Interviewer" || label?.role === "Participant";

          return (
            <div
              key={speaker}
              className={`flex items-center gap-2 p-1.5 rounded-lg border ${
                hasRole
                  ? "bg-brand-pale-green/30 border-brand-forest/30"
                  : "bg-brand-pale-gold/30 border-brand-mustard/40"
              }`}
            >
              <User className={`h-3 w-3 flex-shrink-0 ${hasRole ? "text-brand-forest" : "text-brand-mustard"}`} />

              {editingSpeaker === speaker ? (
                <div className="flex-1 flex flex-col gap-1">
                  <Input
                    type="text"
                    placeholder="Name (optional)"
                    value={speakerName}
                    onChange={(e) => setSpeakerName(e.target.value)}
                    className="h-6 text-[11px]"
                  />
                  <Select value={speakerRole} onValueChange={(value) => setSpeakerRole(value)}>
                    <SelectTrigger className="h-6 text-[11px]">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Interviewer">Interviewer</SelectItem>
                      <SelectItem value="Participant">Participant</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="rounded-full h-5 text-[10px] px-2"
                      onClick={() => {
                        if (speakerRole) {
                          onLabelSpeaker(speaker, speakerName.trim() || speaker, speakerRole || undefined);
                          setEditingSpeaker(null);
                          setSpeakerName("");
                          setSpeakerRole("");
                        }
                      }}
                      disabled={!speakerRole}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full h-5 text-[10px] px-2"
                      onClick={() => { setEditingSpeaker(null); setSpeakerName(""); setSpeakerRole(""); }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-text-primary">{label?.assigned_name || speaker}</span>
                    {label?.role ? (
                      <span className="text-[10px] text-text-secondary ml-1">{label.role}</span>
                    ) : (
                      <span className="text-[10px] text-brand-mustard font-semibold ml-1">No role</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full h-5 w-5 p-0 flex-shrink-0"
                    onClick={() => { setEditingSpeaker(speaker); setSpeakerName(label?.assigned_name || ""); setSpeakerRole(label?.role || ""); }}
                  >
                    <Edit2 className="h-2.5 w-2.5" />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TranscriptSidePanel({
  transcript,
  speakerLabels,
  videoId,
  editingSpeaker,
  setEditingSpeaker,
  speakerName,
  setSpeakerName,
  speakerRole,
  setSpeakerRole,
  onLabelSpeaker,
  uniqueSpeakers,
}: TranscriptSidePanelProps) {
  const speakerEditorProps = {
    uniqueSpeakers,
    speakerLabels,
    editingSpeaker,
    setEditingSpeaker,
    speakerName,
    setSpeakerName,
    speakerRole,
    setSpeakerRole,
    onLabelSpeaker,
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-text-tertiary" />
          <h3 className="text-xs font-semibold text-foreground">Transcript</h3>
        </div>
      </div>

      {/* Speaker roles */}
      <SpeakerRoleEditor {...speakerEditorProps} />

      {/* Transcript content — flex-1 h-0 for proper scroll containment */}
      <ScrollArea className="flex-1 h-0 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]]:!overflow-x-hidden">
        <TranscriptViewer
          transcript={transcript}
          speakerLabels={speakerLabels}
          onLabelSpeaker={onLabelSpeaker}
          videoId={videoId}
          compact
        />
      </ScrollArea>
    </div>
  );
}
