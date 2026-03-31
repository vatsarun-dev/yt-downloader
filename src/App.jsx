import { useMemo, useState } from "react";
import "./App.css";

const videoOptions = [
  { id: "480", label: "480p", detail: "Smaller file size for quick saves." },
  { id: "720", label: "720p", detail: "Balanced HD quality for most downloads." },
  { id: "1080", label: "1080p", detail: "Full HD output when available." },
];

const audioOptions = [
  { id: "128", label: "128 kbps", detail: "Compact audio files." },
  { id: "192", label: "192 kbps", detail: "Balanced sound and file size." },
  { id: "320", label: "320 kbps", detail: "Best MP3 quality for music." },
];

function extractVideoId(input) {
  const trimmed = input.trim();

  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "").split("?")[0];
    }

    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v") || "";
    }

    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/")[2] || "";
    }

    if (parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.split("/")[2] || "";
    }
  } catch {
    return "";
  }

  return "";
}

function App() {
  const [page, setPage] = useState("home");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState("video");
  const [selectedQuality, setSelectedQuality] = useState("720");
  const [statusMessage, setStatusMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const videoId = useMemo(() => extractVideoId(url), [url]);
  const isYoutubeUrl = Boolean(videoId);
  const currentOptions = format === "video" ? videoOptions : audioOptions;

  const selectedOption = useMemo(
    () => currentOptions.find((option) => option.id === selectedQuality) ?? currentOptions[0],
    [currentOptions, selectedQuality]
  );

  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";

  const ytDlpCommand = useMemo(() => {
    const safeUrl = url.trim();
    if (!safeUrl || !isYoutubeUrl) return "";

    if (format === "video") {
      return `yt-dlp -f "bestvideo[height<=${selectedQuality}]+bestaudio/best[height<=${selectedQuality}]" "${safeUrl}"`;
    }

    return `yt-dlp -x --audio-format mp3 --audio-quality ${selectedQuality}K "${safeUrl}"`;
  }, [format, isYoutubeUrl, selectedQuality, url]);

  const goToDownloader = () => {
    if (!isYoutubeUrl) {
      setStatusMessage("Paste a valid YouTube link before continuing.");
      return;
    }

    setStatusMessage("");
    setPage("downloader");
  };

  const handleFormatChange = (nextFormat) => {
    setFormat(nextFormat);
    setSelectedQuality(nextFormat === "video" ? "720" : "320");
    setStatusMessage("");
  };

  const handleCopyCommand = async () => {
    if (!ytDlpCommand) return;

    try {
      await navigator.clipboard.writeText(ytDlpCommand);
      setStatusMessage("yt-dlp command copied to clipboard.");
    } catch {
      setStatusMessage("Clipboard access failed. Use the command box and copy it manually.");
    }
  };

  const handleDirectDownload = async () => {
    if (!isYoutubeUrl || isDownloading) return;

    setStatusMessage("Starting download...");
    setIsDownloading(true);

    const apiUrl = `/api/download?url=${encodeURIComponent(url.trim())}&format=${format}&quality=${selectedQuality}`;

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        let errorMessage = "Download failed on the server.";

        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Fall back to the default message when the server does not return JSON.
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/i);

      link.href = objectUrl;
      link.download = filenameMatch?.[1] || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      setStatusMessage("Download started.");
    } catch (error) {
      setStatusMessage(error.message || "Download failed.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setPage("home")}>
          <span className="brand-icon">▶</span>
          <span>
            <strong>NightTube</strong>
            <small>Downloader</small>
          </span>
        </button>

        <nav className="nav">
          <button
            type="button"
            className={page === "home" ? "active" : ""}
            onClick={() => setPage("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={page === "downloader" ? "active" : ""}
            onClick={() => setPage("downloader")}
          >
            Downloader
          </button>
        </nav>
      </header>

      <main>
        {page === "home" ? (
          <section className="home-page">
            <div className="hero-copy">
              <p className="eyebrow">Two page flow</p>
              <h1>Paste a YouTube link, choose format, and download the media instantly.</h1>
              <p className="lead">
                Clean dark theme, short layout, and a YouTube-inspired interface focused only on
                the downloader flow.
              </p>

              <div className="url-box">
                <input
                  type="url"
                  placeholder="Paste YouTube URL here"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setStatusMessage("");
                  }}
                />
                <button type="button" onClick={goToDownloader}>
                  Continue
                </button>
              </div>

              <p className={`hint ${isYoutubeUrl ? "valid" : ""}`}>
                {isYoutubeUrl
                  ? "Valid YouTube link detected."
                  : "Supports youtube.com/watch, youtu.be, shorts, and embed links."}
              </p>
            </div>

            <div className="hero-preview">
              <div className="preview-frame">
                {thumbnailUrl ? (
                  <img src={thumbnailUrl} alt="YouTube preview thumbnail" />
                ) : (
                  <div className="thumbnail-placeholder">
                    <span>YouTube</span>
                    <p>Your preview appears here after pasting a valid link.</p>
                  </div>
                )}
              </div>

              <div className="preview-meta">
                <div>
                  <span>Current mode</span>
                  <strong>{format === "video" ? "MP4 video" : "MP3 audio"}</strong>
                </div>
                <div>
                  <span>Quality</span>
                  <strong>{selectedOption.label}</strong>
                </div>
                <div>
                  <span>Video ID</span>
                  <strong>{videoId || "Not detected yet"}</strong>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="downloader-page">
            <div className="workspace">
              <div className="panel left-panel">
                <div className="panel-head">
                  <p className="eyebrow">Downloader page</p>
                  <h2>Choose output and quality</h2>
                </div>

                <label className="field-label" htmlFor="yt-url">
                  YouTube URL
                </label>
                <input
                  id="yt-url"
                  className="dark-input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setStatusMessage("");
                  }}
                />

                <div className="choice-row">
                  <button
                    type="button"
                    className={`format-card ${format === "video" ? "active" : ""}`}
                    onClick={() => handleFormatChange("video")}
                  >
                    <span>MP4</span>
                    <strong>Video</strong>
                  </button>
                  <button
                    type="button"
                    className={`format-card ${format === "audio" ? "active" : ""}`}
                    onClick={() => handleFormatChange("audio")}
                  >
                    <span>Audio</span>
                    <strong>Only</strong>
                  </button>
                </div>

                <div className="quality-grid">
                  {currentOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`quality-card ${selectedQuality === option.id ? "active" : ""}`}
                      onClick={() => setSelectedQuality(option.id)}
                    >
                      <strong>{option.label}</strong>
                      <p>{option.detail}</p>
                    </button>
                  ))}
                </div>

                <div className="action-row">
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={!isYoutubeUrl || isDownloading}
                    onClick={handleDirectDownload}
                  >
                    {isDownloading ? "Starting..." : "Direct Download"}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!isYoutubeUrl}
                    onClick={handleCopyCommand}
                  >
                    Copy command
                  </button>
                </div>

                <p className={`hint ${isYoutubeUrl ? "valid" : ""}`}>
                  {isYoutubeUrl
                    ? "Ready to download media securely directly to your device."
                    : "A real YouTube link is required before actions are enabled."}
                </p>
              </div>

              <div className="panel right-panel">
                <div className="video-card">
                  {thumbnailUrl ? (
                    <img src={thumbnailUrl} alt="Selected YouTube thumbnail" />
                  ) : (
                    <div className="thumbnail-placeholder compact">
                      <span>No preview</span>
                      <p>Paste a valid link to load the preview.</p>
                    </div>
                  )}
                </div>

                <div className="summary-card">
                  <div className="summary-row">
                    <span>Output</span>
                    <strong>{format === "video" ? "Video / MP4" : "Audio only"}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Quality</span>
                    <strong>{selectedOption.label}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Status</span>
                    <strong>{isYoutubeUrl ? "Ready" : "Waiting for valid link"}</strong>
                  </div>
                </div>

                <div className="command-card">
                  <p className="eyebrow">Generated command</p>
                  <pre>{ytDlpCommand || "Paste a valid YouTube URL to generate the command."}</pre>
                </div>
              </div>
            </div>
          </section>
        )}

        {statusMessage ? <div className="status-toast">{statusMessage}</div> : null}
      </main>
    </div>
  );
}

export default App;
