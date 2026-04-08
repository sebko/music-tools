import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn, Button, PageHeader } from "@dj-tools/my-component-library";
import { pollPlexOAuth } from "../api/settings";
import {
  usePlexSettings,
  useSavePlexSettings,
  useDisconnectPlex,
  useStartPlexOAuth,
  usePlexLibraries,
} from "../hooks/usePlexSettings";

function SettingsPage() {
  const navigate = useNavigate();
  const { data: savedSettings, refetch: refetchSettings } = usePlexSettings();
  const saveMutation = useSavePlexSettings();
  const disconnectMutation = useDisconnectPlex();
  const startOAuthMutation = useStartPlexOAuth();

  // OAuth flow state
  const [oauthSession, setOauthSession] = useState(null); // { id, code, uri }
  const [pollStatus, setPollStatus] = useState("idle"); // 'idle'|'polling'|'approved'|'failed'
  const [pollError, setPollError] = useState(null);
  const [availableServers, setAvailableServers] = useState([]);
  const pollIntervalRef = useRef(null);
  const plexWindowRef = useRef(null);

  // Server/library selection
  const [selectedServer, setSelectedServer] = useState("");
  const [selectedLibrary, setSelectedLibrary] = useState("");

  // Fetch libraries once a server is selected after OAuth approval
  const { data: librariesData, isLoading: librariesLoading } = usePlexLibraries(
    pollStatus === "approved" && selectedServer ? selectedServer : null
  );
  const availableLibraries = librariesData?.libraries || [];

  // Polling loop
  useEffect(() => {
    if (pollStatus !== "polling" || !oauthSession) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await pollPlexOAuth(oauthSession.id);
        if (result.status === "approved") {
          clearInterval(pollIntervalRef.current);
          plexWindowRef.current?.close();
          plexWindowRef.current = null;
          setAvailableServers(result.servers || []);
          if (result.servers?.length === 1) {
            setSelectedServer(result.servers[0].name);
          }
          setPollStatus("approved");
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
      onError: (err) => {
        setPollError(err.message);
      },
    });
  };

  const handleCancelOAuth = () => {
    clearInterval(pollIntervalRef.current);
    setOauthSession(null);
    setPollStatus("idle");
    setPollError(null);
  };

  const handleDisconnect = () => {
    if (!window.confirm(
      "This will delete all album data and disconnect from Plex. Are you sure?"
    )) return;
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        setOauthSession(null);
        setPollStatus("idle");
        setAvailableServers([]);
        setSelectedServer("");
        setSelectedLibrary("");
      },
    });
  };

  const handleSave = () => {
    saveMutation.mutate(
      { serverName: selectedServer, libraryName: selectedLibrary },
      {
        onSuccess: () => {
          navigate("/?scan=true");
        },
      }
    );
  };

  const isConnected = savedSettings?.configured && savedSettings?.serverName && savedSettings?.libraryName;
  const isPolling = pollStatus === "polling";
  const isApproved = pollStatus === "approved";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />

      {/* Plex Connection Card */}
      <div className="bg-background-secondary border-2 border-border rounded-base p-6 shadow-base">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-heading text-foreground">Plex Connection</h2>
          {isConnected ? (
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

        {/* Connected state: locked display + disconnect */}
        {isConnected && !isApproved && (
          <div className="mb-6 p-4 bg-background border-2 border-border rounded-base">
            <p className="text-sm text-foreground/70 mb-1">
              Server: <span className="font-heading text-foreground">{savedSettings.serverName}</span>
            </p>
            <p className="text-sm text-foreground/70 mb-3">
              Library: <span className="font-heading text-foreground">{savedSettings.libraryName}</span>
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Deleting…
                </span>
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        )}

        {/* OAuth sign-in button (only when not connected and not in OAuth flow) */}
        {!isConnected && !isPolling && !isApproved && (
          <div className="mb-6">
            {pollError && (
              <p className="text-sm text-red-500 mb-3">{pollError}</p>
            )}
            {startOAuthMutation.isError && (
              <p className="text-sm text-red-500 mb-3">{startOAuthMutation.error?.message}</p>
            )}
            <Button
              onClick={handleSignInWithPlex}
              disabled={startOAuthMutation.isPending}
            >
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

        {/* Polling state */}
        {isPolling && (
          <div className="mb-6 p-4 bg-background border-2 border-border rounded-base space-y-3">
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

        {/* Step 2: Server selector (after OAuth approval) */}
        {isApproved && availableServers.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-heading text-foreground mb-1">
              Plex Server
            </label>
            <select
              value={selectedServer}
              onChange={(e) => {
                setSelectedServer(e.target.value);
                setSelectedLibrary("");
              }}
              className={cn(
                "w-full px-3 py-2 bg-background border-2 border-border rounded-base",
                "text-foreground focus:outline-none focus:border-main"
              )}
            >
              <option value="">Select a server…</option>
              {availableServers.map((s) => (
                <option key={s.clientIdentifier} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Step 3: Library selector */}
        {isApproved && selectedServer && (
          <div className="mb-6">
            <label className="block text-sm font-heading text-foreground mb-1">
              Music Library
            </label>
            {librariesLoading ? (
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading libraries…
              </div>
            ) : (
              <select
                value={selectedLibrary}
                onChange={(e) => setSelectedLibrary(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 bg-background border-2 border-border rounded-base",
                  "text-foreground focus:outline-none focus:border-main"
                )}
              >
                <option value="">Select a library…</option>
                {availableLibraries.map((lib) => (
                  <option key={lib.key} value={lib.title}>
                    {lib.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Save button */}
        {isApproved && selectedServer && selectedLibrary && (
          <div className="flex items-center gap-4 pt-2 border-t-2 border-border">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </span>
              ) : (
                "Save & Start Scan"
              )}
            </Button>

            {saveMutation.isError && (
              <span className="text-sm text-red-500">{saveMutation.error?.message}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
