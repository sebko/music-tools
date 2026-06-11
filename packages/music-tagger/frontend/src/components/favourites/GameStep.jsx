import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@dj-tools/my-component-library";
import { Heart, X, Undo2, Check, Music } from "lucide-react";

const SWIPE_ANIMATION_MS = 220;

// Full-screen swipe game: artwork front and centre, -> applies rightAction,
// <- skips, u/Backspace undoes, Escape exits. The judging behaviour lives in the
// `game` object (useSwipeGame result) so different wizards can reuse this screen.
function GameStep({
  game,
  onDone,
  onExit,
  rightAction = { label: "Keep", Icon: Heart, variant: "primary" },
  counterNoun = "shortlisted",
  doneSummary = (count) => `Done — copy ${count} album${count === 1 ? "" : "s"}`,
}) {
  const containerRef = useRef(null);
  const {
    currentAlbum,
    judge,
    undo,
    canUndo,
    shortlistCount,
    remaining,
    isLoading,
    isExhausted,
  } = game;

  const RightIcon = rightAction.Icon;

  // 'right' | 'left' | null — drives the swipe-out animation of the current card
  const [exiting, setExiting] = useState(null);
  const exitingRef = useRef(false);

  const swipe = useCallback(
    (direction) => {
      if (!currentAlbum || exitingRef.current) return;
      exitingRef.current = true;
      setExiting(direction);
      setTimeout(() => {
        judge(direction);
        setExiting(null);
        exitingRef.current = false;
      }, SWIPE_ANIMATION_MS);
    },
    [currentAlbum, judge]
  );

  const handleUndo = useCallback(() => {
    if (exitingRef.current) return;
    undo();
  }, [undo]);

  // Enter fullscreen on mount, leave on unmount
  useEffect(() => {
    const el = containerRef.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        swipe("right");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        swipe("left");
      } else if (e.key === "u" || e.key === "Backspace") {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "Escape") {
        onExit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [swipe, handleUndo, onExit]);

  const cardTransform =
    exiting === "right"
      ? "translate-x-[120%] rotate-[8deg] opacity-0"
      : exiting === "left"
        ? "-translate-x-[120%] -rotate-[8deg] opacity-0"
        : "translate-x-0 rotate-0 opacity-100";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center select-none"
    >
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 z-10">
        <div className="text-sm text-muted-foreground font-heading">
          {remaining != null && <>{remaining} to go</>}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-heading text-foreground">
            <RightIcon className="w-4 h-4 text-main" /> {shortlistCount} {counterNoun}
          </span>
          <Button onClick={onDone} variant="primary" size="sm">
            <Check className="w-4 h-4" /> Done
          </Button>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center w-full px-6 pt-16 pb-28 min-h-0">
        {isLoading && !currentAlbum ? (
          <p className="text-muted-foreground font-heading animate-pulse">Loading albums…</p>
        ) : isExhausted ? (
          <div className="text-center space-y-4">
            <p className="text-xl font-heading text-foreground">All albums judged 🎉</p>
            <Button onClick={onDone} variant="primary" size="lg">
              <Check className="w-4 h-4" /> {doneSummary(shortlistCount)}
            </Button>
          </div>
        ) : currentAlbum ? (
          <div
            className={`flex flex-col items-center gap-4 max-h-full transition-all ease-out ${cardTransform}`}
            style={{ transitionDuration: `${SWIPE_ANIMATION_MS}ms` }}
          >
            {currentAlbum.artworkUrl ? (
              <img
                src={currentAlbum.artworkUrl}
                alt={`${currentAlbum.artist} - ${currentAlbum.title}`}
                className="max-h-[72vh] max-w-[85vw] object-contain rounded-base border-2 border-border shadow-shadow"
                draggable={false}
              />
            ) : (
              <div className="h-[60vh] w-[60vh] max-w-[85vw] flex items-center justify-center rounded-base border-2 border-border bg-secondary-background">
                <Music className="w-24 h-24 text-muted-foreground" />
              </div>
            )}
            <div className="text-center">
              <p className="text-lg font-heading text-foreground">{currentAlbum.title}</p>
              <p className="text-sm text-muted-foreground">
                {currentAlbum.artist}
                {currentAlbum.year ? ` · ${currentAlbum.year}` : ""}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom controls */}
      {!isExhausted && (
        <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-4 p-5 z-10">
          <Button onClick={() => swipe("left")} variant="secondary" size="lg" disabled={!currentAlbum}>
            <X className="w-5 h-5" /> Skip
          </Button>
          <Button onClick={handleUndo} variant="secondary" size="sm" disabled={!canUndo}>
            <Undo2 className="w-4 h-4" /> Undo
          </Button>
          <Button
            onClick={() => swipe("right")}
            variant={rightAction.variant}
            size="lg"
            disabled={!currentAlbum}
          >
            <RightIcon className="w-5 h-5" /> {rightAction.label}
          </Button>
        </div>
      )}

      {/* Key hints */}
      <div className="absolute bottom-1 inset-x-0 text-center text-xs text-muted-foreground">
        ← skip · → {rightAction.label.toLowerCase()} · u undo · esc exit
      </div>
    </div>
  );
}

export default GameStep;
