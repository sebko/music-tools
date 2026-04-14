import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings, useUpdateSetting } from "../hooks/useSettings";
import {
  PageHeader,
  PageLoader,
  Button,
} from "@dj-tools/my-component-library";
import { FolderOpen, Save, Check, AlertCircle, Wand2, Inbox } from "lucide-react";

function SettingsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useSettings();
  const updateSetting = useUpdateSetting();

  const [libraryPath, setLibraryPath] = useState("");
  const [inboxPath, setInboxPath] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [inboxFeedback, setInboxFeedback] = useState(null);

  useEffect(() => {
    if (data?.settings?.musicLibraryPath) {
      setLibraryPath(data.settings.musicLibraryPath);
    }
    if (data?.settings?.inboxPath) {
      setInboxPath(data.settings.inboxPath);
    }
  }, [data]);

  const handleSave = () => {
    setFeedback(null);
    updateSetting.mutate(
      { key: "musicLibraryPath", value: libraryPath.trim() },
      {
        onSuccess: () => {
          setFeedback({ type: "success", message: "Library path saved." });
        },
        onError: (error) => {
          setFeedback({ type: "error", message: error.message });
        },
      }
    );
  };

  const handleSaveInbox = () => {
    setInboxFeedback(null);
    updateSetting.mutate(
      { key: "inboxPath", value: inboxPath.trim() },
      {
        onSuccess: () => {
          setInboxFeedback({ type: "success", message: "Inbox path saved." });
        },
        onError: (error) => {
          setInboxFeedback({ type: "error", message: error.message });
        },
      }
    );
  };

  if (isLoading) {
    return <PageLoader message="Loading settings..." />;
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="max-w-2xl mt-6">
        <div className="rounded-base border-base shadow-base bg-background p-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="w-5 h-5 text-foreground" />
            <h2 className="text-lg font-heading text-foreground">
              Music Library
            </h2>
          </div>

          <label
            htmlFor="library-path"
            className="block text-sm font-heading text-foreground mb-2"
          >
            Library Folder Path
          </label>
          <div className="flex gap-3">
            <input
              id="library-path"
              type="text"
              value={libraryPath}
              onChange={(e) => {
                setLibraryPath(e.target.value);
                setFeedback(null);
              }}
              placeholder="/path/to/your/music/folder"
              className="flex-1 px-4 py-2 rounded-base border-base shadow-base bg-background text-foreground font-base text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-main"
            />
            <Button
              onClick={handleSave}
              variant="primary"
              size="md"
              isDisabled={updateSetting.isPending || !libraryPath.trim()}
            >
              <Save className="w-4 h-4" />
              {updateSetting.isPending ? "Saving..." : "Save"}
            </Button>
          </div>

          <p className="mt-2 text-xs text-foreground/60">
            The root folder containing your album directories. Falls back to the
            MUSIC_LIBRARY_PATH environment variable if not set.
          </p>

          {feedback && (
            <div
              className={`mt-3 flex items-center gap-2 text-sm font-heading ${
                feedback.type === "success"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {feedback.type === "success" ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {feedback.message}
            </div>
          )}
        </div>

        <div className="rounded-base border-base shadow-base bg-background p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="w-5 h-5 text-foreground" />
            <h2 className="text-lg font-heading text-foreground">
              Inbox
            </h2>
          </div>

          <label
            htmlFor="inbox-path"
            className="block text-sm font-heading text-foreground mb-2"
          >
            Inbox Folder Path
          </label>
          <div className="flex gap-3">
            <input
              id="inbox-path"
              type="text"
              value={inboxPath}
              onChange={(e) => {
                setInboxPath(e.target.value);
                setInboxFeedback(null);
              }}
              placeholder="/path/to/your/inbox/folder"
              className="flex-1 px-4 py-2 rounded-base border-base shadow-base bg-background text-foreground font-base text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-main"
            />
            <Button
              onClick={handleSaveInbox}
              variant="primary"
              size="md"
              isDisabled={updateSetting.isPending || !inboxPath.trim()}
            >
              <Save className="w-4 h-4" />
              {updateSetting.isPending ? "Saving..." : "Save"}
            </Button>
          </div>

          <p className="mt-2 text-xs text-foreground/60">
            Drop new audio files here and import them from the Inbox page. Files are moved into the library and tagged as singles.
          </p>

          {inboxFeedback && (
            <div
              className={`mt-3 flex items-center gap-2 text-sm font-heading ${
                inboxFeedback.type === "success"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {inboxFeedback.type === "success" ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {inboxFeedback.message}
            </div>
          )}
        </div>

        <div className="rounded-base border-base shadow-base bg-background p-6 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="w-5 h-5 text-foreground" />
            <h2 className="text-lg font-heading text-foreground">
              Setup Wizard
            </h2>
          </div>
          <p className="text-sm text-foreground/60 mb-4">
            Re-run the onboarding wizard to wipe and reimport your beets library, clean up unprocessed files, and run plugins.
          </p>
          <Button
            variant="default"
            size="md"
            onClick={() => navigate("/setup")}
          >
            <Wand2 className="w-4 h-4" />
            Run setup wizard
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
