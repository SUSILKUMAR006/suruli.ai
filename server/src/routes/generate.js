const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const videoService = require('../services/videoService');
const whisperService = require('../services/whisperService');
const llmService = require('../services/llmService');
const assGenerator = require('../utils/assGenerator');

// Configure multer storage to save directly to the root videos directory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dirPath = path.join(__dirname, '../../../videos');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    cb(null, dirPath);
  },
  filename: function (req, file, cb) {
    const videoId = 'upload_' + Date.now();
    cb(null, `${videoId}.mp4`);
  }
});

const upload = multer({ storage: storage });

/**
 * Adjusts raw start/end timestamps to line up cleanly with Whisper segment boundaries.
 * This prevents phrases/sentences from being cut off mid-word.
 */
function adjustTimestampsToSentence(start, end, segments, log, clipNumber) {
  if (!segments || segments.length === 0) {
    return { start, end };
  }

  let adjustedStart = start;
  let adjustedEnd = end;

  // 1. Find segment closest to proposed start
  let bestStartDiff = Infinity;
  let startSeg = null;

  for (const seg of segments) {
    if (start >= seg.start && start <= seg.end) {
      startSeg = seg;
      break;
    }
    const diff = Math.abs(seg.start - start);
    if (diff < bestStartDiff) {
      bestStartDiff = diff;
      startSeg = seg;
    }
  }

  if (startSeg) {
    adjustedStart = startSeg.start;
    log(`[INFO] Clip ${clipNumber}: Adjusted start from ${start}s to ${adjustedStart}s (aligned to segment start: "${startSeg.text.trim()}")`);
  }

  // 2. Find segment closest to proposed end
  let bestEndDiff = Infinity;
  let endSeg = null;

  for (const seg of segments) {
    if (end >= seg.start && end <= seg.end) {
      endSeg = seg;
      break;
    }
    const diff = Math.abs(seg.end - end);
    if (diff < bestEndDiff) {
      bestEndDiff = diff;
      endSeg = seg;
    }
  }

  if (endSeg) {
    adjustedEnd = endSeg.end;
    log(`[INFO] Clip ${clipNumber}: Adjusted end from ${end}s to ${adjustedEnd}s (aligned to segment end: "${endSeg.text.trim()}")`);
  }

  if (adjustedEnd <= adjustedStart) {
    adjustedEnd = adjustedStart + (end - start);
  }

  return {
    start: Number(adjustedStart.toFixed(2)),
    end: Number(adjustedEnd.toFixed(2))
  };
}

/**
 * Common pipeline execution for extracting audio, transcribing, choosing clips, and rendering
 */
async function runPipeline(videoId, clipLength, numberOfShorts, model, log, res, mode = 'shorts', stylePreset = 'word_pop', burnHook = false, highlightColor = '#ff2a5f', captionPosition = 'bottom', captionPosX = 540, captionPosY = 1540) {
  // Create directories if they are missing
  const dirs = ['videos', 'temp', 'transcripts', 'subtitles', 'output'];
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, `../../../${dir}`);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Step 2: Extract Audio
  log("Extracting audio...");
  const audioPath = await videoService.extractAudio(videoId, log);

  // Step 3: Generate Transcript (Whisper)
  log("Generating transcript...");
  const { jsonPath, txtPath } = await whisperService.runWhisper(audioPath, videoId, log);

  const whisperJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const clips = [];
  const isBurnHook = burnHook === true || burnHook === 'true';

  if (mode === 'captions_only') {
    log("Processing in Caption Only Mode (no trimming)...");

    // Fetch video metadata including duration
    const metadata = await videoService.getVideoMetadata(videoId);
    const duration = parseFloat(metadata.duration);
    log(`[INFO] Video duration: ${duration.toFixed(2)}s`);

    const clipId = `${videoId}_captioned`;
    const start = 0;
    const end = duration;

    // Generate Subtitles (ASS) for the entire video (without hook)
    const assContent = assGenerator.generateAssForClip(whisperJson, start, end, "", { preset: stylePreset, burnHook: false, highlightColor, captionPosition, captionPosX, captionPosY });
    const assPath = path.join(__dirname, '../../../subtitles', `${clipId}.ass`);
    fs.writeFileSync(assPath, assContent, 'utf8');
    log(`[INFO] Generated ASS subtitles at: subtitles/${clipId}.ass`);

    // Crop, Scale, and Burn Subtitles
    log("Adding subtitles...");
    log("Rendering video...");
    const videoFilename = await videoService.processClip(videoId, clipId, start, end, log);

    clips.push({
      title: "Captioned Short Video",
      hook: "",
      caption: whisperJson.text || "",
      start: start.toString(),
      end: end.toString(),
      video: `/output/${videoFilename}`
    });

  } else {
    // Step 4: Analyze Transcript (Groq)
    log("Analyzing transcript with Groq LLM...");
    const transcriptText = fs.readFileSync(txtPath, 'utf8');

    if (!transcriptText.trim()) {
      throw new Error("Transcription resulted in empty text. Cannot identify clips.");
    }

    const rawClips = await llmService.selectClips(transcriptText, clipLength || 45, numberOfShorts || 5, log, model);

    // Step 5: Process Clips
    log("Cutting clips and generating subtitle overlays...");
    for (let i = 0; i < rawClips.length; i++) {
      const clip = rawClips[i];
      const clipId = `${videoId}_clip_${i + 1}`;
      
      // Smooth boundary alignment to prevent sentence cutoff
      let { start, end } = adjustTimestampsToSentence(Number(clip.start), Number(clip.end), whisperJson.segments, log, i + 1);
      
      let duration = end - start;
      const MIN_DURATION = 20;

      if (duration < MIN_DURATION) {
        const missing = MIN_DURATION - duration;
        let newStart = start - (missing / 2);
        let newEnd = end + (missing / 2);

        if (newStart < 0) {
          newEnd += Math.abs(newStart);
          newStart = 0;
        }

        const maxTime = whisperJson.segments[whisperJson.segments.length - 1]?.end || 9999;
        if (newEnd > maxTime) {
          const overflow = newEnd - maxTime;
          newStart = Math.max(0, newStart - overflow);
          newEnd = maxTime;
        }

        start = Number(newStart.toFixed(2));
        end = Number(newEnd.toFixed(2));
        duration = end - start;
        log(`[INFO] Clip ${i + 1} duration was too short (${(end - start).toFixed(1)}s). Expanded boundaries to: ${start}s - ${end}s (${duration.toFixed(1)}s total)`);
      }

      log(`[PROCESS] Processing clip ${i + 1}/${rawClips.length}: "${clip.title}" (${start}s - ${end}s)`);

      // Generate Subtitles (ASS) for this specific clip range
      const hookText = isBurnHook ? (clip.hook || clip.title || "") : "";
      const assContent = assGenerator.generateAssForClip(whisperJson, start, end, hookText, { preset: stylePreset, burnHook: isBurnHook, highlightColor, captionPosition, captionPosX, captionPosY });
      const assPath = path.join(__dirname, '../../../subtitles', `${clipId}.ass`);
      fs.writeFileSync(assPath, assContent, 'utf8');
      log(`[INFO] Generated ASS subtitles at: subtitles/${clipId}.ass`);

      // Cut, Crop, and Burn Subtitles
      log("Adding subtitles...");
      log("Rendering video...");
      const videoFilename = await videoService.processClip(videoId, clipId, start, end, log);

      clips.push({
        title: clip.title,
        hook: clip.hook || "",
        caption: clip.caption,
        start: start.toString(),
        end: end.toString(),
        video: `/output/${videoFilename}` // Served statically by backend
      });
    }
  }

  log("Finished.");
  res.write(JSON.stringify({ success: true, clips }) + '\n');
  res.end();
}

// Endpoint for processing from YouTube URL
router.post('/', async (req, res) => {
  // Disable HTTP timeouts
  req.setTimeout(0);
  res.setTimeout(0);

  // Set streaming headers
  res.setHeader('Content-Type', 'application/json-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const log = (msg) => {
    console.log(msg);
    res.write(JSON.stringify({ status: msg }) + '\n');
  };

  try {
    const { youtubeUrl, clipLength, numberOfShorts, model, mode, stylePreset, burnHook, highlightColor, captionPosition, captionPosX, captionPosY } = req.body;
    
    if (!youtubeUrl) {
      throw new Error("Missing youtubeUrl parameter");
    }

    const videoId = videoService.getYoutubeId(youtubeUrl);
    if (!videoId) {
      throw new Error("Invalid YouTube URL: Could not extract 11-character video ID");
    }

    log(`[INFO] Validated YouTube URL. Video ID is: ${videoId}`);

    // Create directories if they are missing
    const dirs = ['videos', 'temp', 'transcripts', 'subtitles', 'output'];
    for (const dir of dirs) {
      const dirPath = path.join(__dirname, `../../../${dir}`);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // Step 1: Download Video
    log("Downloading video...");
    await videoService.downloadVideo(youtubeUrl, videoId, log);

    // Call shared pipeline starting from Step 2
    await runPipeline(videoId, clipLength, numberOfShorts, model, log, res, mode, stylePreset, burnHook, highlightColor, captionPosition, captionPosX, captionPosY);

  } catch (error) {
    console.error("Error in generation workflow:", error);
    res.write(JSON.stringify({ success: false, error: error.message }) + '\n');
    res.end();
  }
});

// Endpoint for processing uploaded video files
router.post('/upload', upload.single('videoFile'), async (req, res) => {
  // Disable HTTP timeouts
  req.setTimeout(0);
  res.setTimeout(0);

  // Set streaming headers
  res.setHeader('Content-Type', 'application/json-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const log = (msg) => {
    console.log(msg);
    res.write(JSON.stringify({ status: msg }) + '\n');
  };

  try {
    if (!req.file) {
      throw new Error("No video file uploaded");
    }

    const { clipLength, numberOfShorts, model, mode, stylePreset, burnHook, highlightColor, captionPosition, captionPosX, captionPosY } = req.body;
    const videoId = path.basename(req.file.filename, '.mp4');

    log(`[INFO] Video uploaded successfully. Temp Video ID: ${videoId}`);

    // Call shared pipeline starting from Step 2
    await runPipeline(videoId, Number(clipLength), Number(numberOfShorts), model, log, res, mode, stylePreset, burnHook, highlightColor, captionPosition, captionPosX, captionPosY);

  } catch (error) {
    console.error("Error in upload workflow:", error);
    res.write(JSON.stringify({ success: false, error: error.message }) + '\n');
    res.end();
  }
});

module.exports = router;
