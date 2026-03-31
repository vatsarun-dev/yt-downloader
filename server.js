import express from "express";
import cors from "cors";
import ytdl from "@distube/ytdl-core";
import { spawn } from "child_process";

globalThis.process.env.YTDL_NO_UPDATE = "1";

const app = express();
app.use(cors());

function sanitizeFilename(value) {
  const stripped = Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);
    return !/[<>:"/\\|?*]/.test(character) && code >= 32;
  });

  return stripped.join("").trim() || "download";
}

function toAsciiFilename(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "download";
}

function sortFormatsByQuality(a, b) {
  const heightDelta = (b.height || 0) - (a.height || 0);
  if (heightDelta !== 0) return heightDelta;

  const audioDelta = (b.audioBitrate || 0) - (a.audioBitrate || 0);
  if (audioDelta !== 0) return audioDelta;

  return (b.bitrate || 0) - (a.bitrate || 0);
}

function pickVideoFormat(formats, maxHeight) {
  const downloadableFormats = formats.filter((format) => format.hasVideo && format.hasAudio);

  if (downloadableFormats.length === 0) {
    return null;
  }

  const strategies = [
    (format) => format.container === "mp4" && (!maxHeight || !format.height || format.height <= maxHeight),
    (format) => !maxHeight || !format.height || format.height <= maxHeight,
    (format) => format.container === "mp4",
    () => true,
  ];

  for (const strategy of strategies) {
    const match = downloadableFormats.filter(strategy).sort(sortFormatsByQuality)[0];
    if (match) {
      return match;
    }
  }

  return null;
}

function pickAudioFormat(formats) {
  const audioFormats = formats
    .filter((format) => format.hasAudio && !format.hasVideo)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

  return audioFormats[0] || null;
}

function streamWithYtDlp({ videoUrl, format, quality, filename }, res) {
  return new Promise((resolve, reject) => {
    const args =
      format === "audio"
        ? [
            "-f",
            "bestaudio[ext=m4a]/bestaudio",
            "--no-playlist",
            "-o",
            "-",
            videoUrl,
          ]
        : [
            "-f",
            `best[ext=mp4][height<=${quality}]/best[height<=${quality}]/best[ext=mp4]/best`,
            "--no-playlist",
            "-o",
            "-",
            videoUrl,
          ];

    const ytDlpProcess = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderrOutput = "";
    let settled = false;

    ytDlpProcess.once("spawn", () => {
      const extension = format === "audio" ? "m4a" : "mp4";
      const contentType = format === "audio" ? "audio/mp4" : "video/mp4";

      res.setHeader("Content-Disposition", `attachment; filename="${filename}.${extension}"`);
      res.setHeader("Content-Type", contentType);
      ytDlpProcess.stdout.pipe(res);
      settled = true;
      resolve(true);
    });

    ytDlpProcess.stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    ytDlpProcess.once("error", (error) => {
      if (error.code === "ENOENT") {
        return reject(new Error("YT_DLP_MISSING"));
      }

      return reject(error);
    });

    ytDlpProcess.once("close", (code) => {
      if (code === 0) {
        return;
      }

      if (!settled) {
        reject(new Error(stderrOutput.trim() || `yt-dlp exited with code ${code}`));
        return;
      }

      if (!res.writableEnded) {
        res.end();
      }
    });
  });
}

async function streamWithYtdl({ videoUrl, format, quality, filename }, res) {
  const info = await ytdl.getInfo(videoUrl, {
    playerClients: ["ANDROID", "IOS", "TV", "WEB_EMBEDDED"],
  });

  let selectedFormat;
  let extension;
  let contentType;

  if (format === "audio") {
    selectedFormat = pickAudioFormat(info.formats);

    if (!selectedFormat) {
      throw new Error("No downloadable audio stream was found for this video.");
    }

    extension = selectedFormat.container || "m4a";
    contentType = selectedFormat.mimeType?.split(";")[0] || "audio/mp4";
  } else {
    selectedFormat = pickVideoFormat(info.formats, quality);

    if (!selectedFormat) {
      throw new Error("No downloadable video stream with both audio and video was found for this link.");
    }

    extension = selectedFormat.container || "mp4";
    contentType = selectedFormat.mimeType?.split(";")[0] || "video/mp4";
  }

  res.setHeader("Content-Disposition", `attachment; filename="${filename}.${extension}"`);
  res.setHeader("Content-Type", contentType);

  return new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, {
      format: selectedFormat,
      highWaterMark: 1 << 25,
    });

    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(res);
  });
}

app.get("/api/download", async (req, res) => {
  const videoUrl = req.query.url?.trim();
  const format = req.query.format || "video";
  const quality = Number(req.query.quality) || 720;

  if (!videoUrl || !ytdl.validateURL(videoUrl)) {
    return res.status(400).json({ error: "Enter a valid YouTube URL." });
  }

  const safeHeaderFilename = toAsciiFilename(sanitizeFilename("download"));

  try {
    try {
      await streamWithYtDlp(
        {
          videoUrl,
          format,
          quality,
          filename: safeHeaderFilename,
        },
        res
      );
      return;
    } catch (error) {
      if (error.message !== "YT_DLP_MISSING") {
        console.warn(`yt-dlp ${format} fallback failed, trying ytdl-core:`, error.message);
      }
    }

    let title = "download";

    try {
      const info = await ytdl.getBasicInfo(videoUrl, {
        playerClients: ["ANDROID", "IOS", "TV", "WEB_EMBEDDED"],
      });
      title = info.videoDetails?.title || title;
    } catch {
      // Use the default filename when metadata fetch is unavailable.
    }

    await streamWithYtdl(
      {
        videoUrl,
        format,
        quality,
        filename: toAsciiFilename(sanitizeFilename(title)),
      },
      res
    );
  } catch (error) {
    console.error("Download handler error:", error);

    const message =
      error?.message === "YT_DLP_MISSING"
        ? "Install yt-dlp on your system, then restart the server."
        : error?.message || "Failed to fetch downloadable media from YouTube.";

    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      res.end();
    }
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend Server running on http://localhost:${PORT}`);
});
