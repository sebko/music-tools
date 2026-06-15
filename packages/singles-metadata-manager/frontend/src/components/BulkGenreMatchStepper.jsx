import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "@music-tools/my-component-library";
import {
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Check,
  Loader,
  X,
  Sparkles,
} from "lucide-react";
import EnrichmentCard from "./EnrichmentCard";
import { fetchClaudeForTrackByPath } from "../api/enrichment";

/**
 * Interactive per-track genre review.
 *
 * Phases: `preflight → cards`.
 *
 * Preflight asks one question: should the AI scan run on each card load?
 * Picking either option drops straight into the cards — there is no bulk
 * prefetch any more. Each card lazy-loads its own last.fm (and Claude, if
 * AI was enabled) the first time it becomes the active card.
 *
 * @param {Object} props
 * @param {Array<{path: string}>} props.tracks - Tracks to review
 * @param {boolean} props.isOpen - Whether the stepper is shown
 * @param {Function} props.onClose - Called when the user finishes or dismisses
 */
function BulkGenreMatchStepper({ tracks, isOpen, onClose }) {
  const [phase, setPhase] = useState("preflight"); // preflight | cards
  const [runAiOnLoad, setRunAiOnLoad] = useState(false);
  const [index, setIndex] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const cardRefs = useRef([]);

  useEffect(() => {
    if (!isOpen) return;
    setPhase("preflight");
    setRunAiOnLoad(false);
    setIndex(0);
    cardRefs.current = [];
  }, [isOpen]);

  const startCards = (withAi) => {
    setRunAiOnLoad(withAi);
    setIndex(0);
    cardRefs.current = [];
    setPhase("cards");
  };

  const total = tracks.length;
  const isLast = index === total - 1;
  const atStart = index === 0;

  const goNext = () => {
    if (index < total - 1) setIndex((i) => i + 1);
    else onClose?.();
  };

  const handleApproveNext = async () => {
    const card = cardRefs.current[index];
    if (!card) {
      goNext();
      return;
    }
    setAdvancing(true);
    try {
      await card.applyIfNeeded();
      goNext();
    } catch {
      // Card surfaces its own red error block; keep the user on this card.
    } finally {
      setAdvancing(false);
    }
  };

  const handleSkip = () => {
    if (advancing) return;
    goNext();
  };

  const handleBack = () => {
    if (advancing || atStart) return;
    setIndex((i) => i - 1);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-5xl"
      closeOnBackdropClick={false}
      className="max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border">
        <div>
          <h2 className="font-heading text-foreground text-lg">
            Match genres (interactive)
          </h2>
          {phase === "cards" && total > 0 && (
            <p className="text-xs font-mono text-foreground/60 mt-0.5">
              Track {index + 1} of {total}
            </p>
          )}
        </div>
        <Button variant="default" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
          Close
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {phase === "preflight" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-heading text-foreground text-base mb-1">
                Run AI scanner when each card loads?
              </h3>
              <p className="text-xs text-foreground/60">
                Last.fm runs per-track on card load either way. Adding the AI
                scan fills in scalar fields (artist/title/year/etc.) and
                enriches the genre list — slower (~30–60s per track) and uses
                your Anthropic quota.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => startCards(false)}
              >
                <SkipForward className="w-4 h-4" />
                Skip AI
              </Button>
              <Button
                variant="default"
                size="md"
                onClick={() => startCards(true)}
              >
                <Sparkles className="w-4 h-4" />
                Run AI on each card
              </Button>
            </div>
          </div>
        )}

        {phase === "cards" && total === 0 && (
          <div className="text-sm text-foreground/60">No tracks to review.</div>
        )}

        {phase === "cards" && total > 0 && (
          <div>
            {tracks.map((t, i) => (
              <div key={t.path} hidden={i !== index}>
                <EnrichmentCard
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  lazyFilePath={t.path}
                  isActive={i === index}
                  runAiOnLoad={runAiOnLoad}
                  onClaudeScan={fetchClaudeForTrackByPath}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {phase === "cards" && total > 0 && (
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t-2 border-border">
          <Button
            variant="secondary"
            size="md"
            onClick={handleBack}
            disabled={atStart || advancing}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              size="md"
              onClick={handleSkip}
              disabled={advancing}
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleApproveNext}
              disabled={advancing}
            >
              {advancing ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : isLast ? (
                <Check className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              {isLast ? "Approve & finish" : "Approve & next"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default BulkGenreMatchStepper;
