import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn, Button, PageHeader, ThemeToggle } from "@music-tools/my-component-library";
import { pollPlexOAuth } from "../api/settings";
import {
  usePlexSettings,
  useSavePlexSelection,
  useDisconnectPlex,
  useStartPlexOAuth,
} from "../hooks/usePlexSettings";

function SettingsPage() {
  const navigate = useNavigate();
  const { data: settings, refetch: refetchSettings } = usePlexSettings();
  const saveSelection = useSavePlexSelection();
  const disconnectMutation = useDisconnectPlex();
  const startOAuthMutation = useStartPlexOAuth();

  // OAuth flow state
  const [oauthSession, setOauthSession] = useState(null); // { id, code, uri }
  const [pollStatus, setPollStatus] = useState("idle"); // 'idle'|'polling'|'failed'
  const [pollError, setPollError] = useState(null);
  const pollIntervalRef = useRef(null);
  const plexWindowRef = useRef(null);

  const servers = useMemo(() => settings?.servers || [], [settings]);
  const configured = !!settings?.configured;

  // Selected library ids — seeded once from the persisted enabled set.
  const [selectedLibraryIds, setSelectedLibraryIds] = useState(null);
  useEffect(() => {
    if (selectedLibraryIds === null && servers.length > 0) {
      const enabled = new Set();
      servers.forEach((s) => s.libraries.forEach((l) => { if (l.isEnabled) enabled.add(l.id); }));
      setSelectedLibraryIds(enabled);
    }
  }, [servers, selectedLibraryIds]);
  const selected = selectedLibraryIds || new Set();

  // Polling loop — on approval the backend returns the discovered server/library tree.
  useEffect(() => {
    if (pollStatus !== "polling" || !oauthSession) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await pollPlexOAuth(oauthSession.id);
        if (result.status === "approved") {
          clearInterval(pollIntervalRef.current);
          plexWindowRef.current?.close();
          plexWindowRef.current = null;
          setPollStatus("idle");
          setSelectedLibraryIds(null); // reseed from the freshly discovered tree
          refetchSettings();
        } else if (result.status === "failed") {
          clearInterval(pollIntervalRef.current);
          setPollError(result.error || "OAuth failed");
          setPollStatus("failed");
        }
        // pending → keep polling
      } catch (err) {
        clearInterval(pollIntervalRef.current);
        setPollError(err.message);
        setPollStatus("failed");
      }
    }, 3000);

    return () => clearInterval(pollIntervalRef.current);
  }, [pollStatus, oauthSession, refetchSettings]);

  const handleSignInWithPlex = () => {
    setPollError(null);
    startOAuthMutation.mutate(undefined, {
      onSuccess: (data) => {
        setOauthSession(data);
        setPollStatus("polling");
        plexWindowRef.current = window.open(data.uri, "_blank");
      },
      onError: (err) => setPollError(err.message),
    });
  };

  const handleCancelOAuth = () => {
    clearInterval(pollIntervalRef.current);
    setOauthSession(null);
    setPollStatus("idle");
    setPollError(null);
  };

  const handleDisconnect = () => {
    if (!window.confirm("This will delete all album data and disconnect from Plex. Are you sure?")) return;
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        setOauthSession(null);
        setPollStatus("idle");
        setSelectedLibraryIds(null);
      },
    });
  };

  const toggleLibrary = (id) => {
    setSelectedLibraryIds((prev) => {
      const next = new Set(prev || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    const ids = Array.from(selected);
    saveSelection.mutate(ids, {
      onSuccess: (res) => {
        const target = res?.activeLibraryId || ids[0];
        if (target) navigate(`/?library=${encodeURIComponent(target)}&scan=all`);
      },
    });
  };

  const isPolling = pollStatus === "polling";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />

      <div className="bg-background-secondary border-2 border-border rounded-base p-6 shadow-base">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-heading text-foreground">Plex Connection</h2>
          {configured ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-main text-main-foreground rounded-base border-2 border-border text-sm font-heading">
              <CheckCircle className="w-4 h-4" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-background text-foreground rounded-base border-2 border-border text-sm font-heading">
              <XCircle className="w-4 h-4" />
              Not connected
            </span>
          )}
        </div>

        {/* Sign in (not configured, not mid-OAuth) */}
        {!configured && !isPolling && (
          <div className="mb-2">
            {pollError && <p className="text-sm text-red-500 mb-3">{pollError}</p>}
            {startOAuthMutation.isError && (
              <p className="text-sm text-red-500 mb-3">{startOAuthMutation.error?.message}</p>
            )}
            <Button onClick={handleSignInWithPlex} disabled={startOAuthMutation.isPending}>
              {startOAuthMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting…
                </span>
              ) : (
                "Sign in with Plex"
              )}
            </Button>
          </div>
        )}

        {/* Polling */}
        {isPolling && (
          <div className="mb-2 p-4 bg-background border-2 border-border rounded-base space-y-3">
            <div className="flex items-center gap-2 text-sm font-heading text-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Waiting for Plex authorization…
            </div>
            <p className="text-sm text-foreground/70">
              Approve the request in the Plex tab that just opened.
            </p>
            <Button variant="default" size="sm" onClick={handleCancelOAuth}>
              Cancel
            </Button>
          </div>
        )}

        {/* Configured: account + per-server library checkboxes */}
        {configured && (
          <>
            <p className="text-sm text-foreground/70 mb-4">
              Signed in{settings.username ? ` as ${settings.username}` : ""}. Choose which
              libraries to manage across your servers.
            </p>

            {servers.length === 0 && (
              <p className="text-sm text-foreground/60 mb-4">No servers found on this account.</p>
            )}

            {servers.map((server) => (
              <div key={server.id} className="mb-4">
                <div className="text-sm font-heading text-foreground/80 mb-2">{server.name}</div>
                {server.libraries.length === 0 ? (
                  <p className="text-sm text-foreground/50 pl-1">No music libraries on this server.</p>
                ) : (
                  <div className="space-y-2">
                    {server.libraries.map((lib) => (
                      <label
                        key={lib.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-base border-2 cursor-pointer transition-colors",
                          selected.has(lib.id)
                            ? "border-main bg-main/10"
                            : "border-border bg-background hover:border-foreground/30"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(lib.id)}
                          onChange={() => toggleLibrary(lib.id)}
                          className="accent-main w-4 h-4"
                        />
                        <span className="text-foreground font-heading text-sm">{lib.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center gap-4 pt-3 border-t-2 border-border">
              <Button onClick={handleSave} disabled={saveSelection.isPending || selected.size === 0}>
                {saveSelection.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Save & Start Scan"
                )}
              </Button>

              <Button variant="default" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                {disconnectMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Disconnecting…
                  </span>
                ) : (
                  "Disconnect"
                )}
              </Button>

              {saveSelection.isError && (
                <span className="text-sm text-red-500">{saveSelection.error?.message}</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-background-secondary border-2 border-border rounded-base p-6 shadow-base mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-heading text-foreground">Appearance</h2>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
