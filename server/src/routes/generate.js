const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const videoService = require('../services/videoService');
const whisperService = require('../services/whisperService');
const llmService = require('../services/llmService');
const assGenerator = require('../utils/assGenerator');

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
    const { youtubeUrl, clipLength, numberOfShorts } = req.body;
    
    if (!youtubeUrl) {
      throw new Error("Missing youtubeUrl parameter");
    }

    const videoId = videoService.getYoutubeId(youtubeUrl);
    if (!videoId) {
      throw new Error("Invalid YouTube URL: Could not extract 11-character video ID");
    }

    log(`[INFO] Validated YouTube URL. Video ID is: ${videoId}`);

    // Create directories if they somehow disappeared
    const dirs = ['videos', 'temp', 'transcripts', 'subtitles', 'output'];
    for (const dir of dirs) {
      const dirPath = path.join(__dirname, `../../../${dir}`);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // Step 1: Download Video
    log("Downloading video...");
    const videoPath = await videoService.downloadVideo(youtubeUrl, videoId, log);

    // Step 2: Extract Audio
    log("Extracting audio...");
    const audioPath = await videoService.extractAudio(videoId, log);

    // Step 3: Generate Transcript (Whisper)
    log("Generating transcript...");
    const { jsonPath, txtPath } = await whisperService.runWhisper(audioPath, videoId, log);

    // Step 4: Analyze Transcript (Groq)
    log("Analyzing transcript...");
    const transcriptText = fs.readFileSync(txtPath, 'utf8');
    const whisperJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    if (!transcriptText.trim()) {
      throw new Error("Transcription resulted in empty text. Cannot identify clips.");
    }

    const rawClips = await llmService.selectClips(transcriptText, clipLength || 45, numberOfShorts || 5, log);

    // Step 5: Process Clips
    log("Cutting clips...");
    const clips = [];
    for (let i = 0; i < rawClips.length; i++) {
      const clip = rawClips[i];
      const clipId = `${videoId}_clip_${i + 1}`;
      
      let start = Number(clip.start);
      let end = Number(clip.end);
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
      const assContent = assGenerator.generateAssForClip(whisperJson, start, end);
      const assPath = path.join(__dirname, '../../../subtitles', `${clipId}.ass`);
      fs.writeFileSync(assPath, assContent, 'utf8');
      log(`[INFO] Generated ASS subtitles at: subtitles/${clipId}.ass`);

      // Cut, Crop, and Burn Subtitles
      log("Adding subtitles...");
      log("Rendering video...");
      const videoFilename = await videoService.processClip(videoId, clipId, start, end, log);

      clips.push({
        title: clip.title,
        caption: clip.caption,
        start: start.toString(),
        end: end.toString(),
        video: `/output/${videoFilename}` // Served statically by backend
      });
    }

    log("Finished.");
    res.write(JSON.stringify({ success: true, clips }) + '\n');
    res.end();

  } catch (error) {
    console.error("Error in generation workflow:", error);
    res.write(JSON.stringify({ success: false, error: error.message }) + '\n');
    res.end();
  }
});

module.exports = router;
