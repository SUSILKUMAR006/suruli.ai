/**
 * Format seconds to ASS timestamp format (H:MM:SS.cs)
 */
function formatAssTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds - hrs * 3600) / 60);
  const secs = Math.floor(seconds - hrs * 3600 - mins * 60);
  const cs = Math.floor(Math.round((seconds - Math.floor(seconds)) * 100));
  
  // Guard against centisecond overflow
  const cleanCs = cs >= 100 ? 99 : cs;

  return [
    String(hrs),
    ':',
    String(mins).padStart(2, '0'),
    ':',
    String(secs).padStart(2, '0'),
    '.',
    String(cleanCs).padStart(2, '0')
  ].join('');
}

/**
 * Converts a standard hex color (e.g. "#ff2a5f") to ASS color format (&H00BBGGRR)
 */
function hexToAssColor(hex) {
  if (!hex) return '&H0000FFFF'; // default to yellow
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 6) {
    const r = cleanHex.substring(0, 2);
    const g = cleanHex.substring(2, 4);
    const b = cleanHex.substring(4, 6);
    return `&H00${b}${g}${r}`;
  }
  return '&H0000FFFF';
}

function buildCaptionPositionOverride(options = {}) {
  const captionPosition = options.captionPosition || 'bottom';
  const presets = {
    bottom: { x: 540, y: 1540 },
    middle: { x: 540, y: 960 },
    top: { x: 540, y: 260 },
  };

  if (captionPosition !== 'custom') {
    const preset = presets[captionPosition] || presets.bottom;
    return `\\an5\\pos(${preset.x},${preset.y})`;
  }

  const x = Number(options.captionPosX);
  const y = Number(options.captionPosY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const preset = presets.bottom;
    return `\\an5\\pos(${preset.x},${preset.y})`;
  }

  return `\\an5\\pos(${Math.round(x)},${Math.round(y)})`;
}

function cleanWordText(word) {
  return String(word || '')
    .trim()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '')
    .toUpperCase();
}
function escapeAssText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .trim();
}
/**
 * Generates ASS file content for a specific clip range from Whisper transcription JSON.
 * Groups words into short, timing-aware blocks and highlights the active word.
 */
function generateAssForClip(whisperData, clipStart, clipEnd, hookText, options = {}) {
  const presetName = options.preset || 'word_pop';
  const highlightColorHex = options.highlightColor || '#ff2a5f';
  const highlightColorAss = hexToAssColor(highlightColorHex);
  const burnHook = options.burnHook !== undefined ? options.burnHook : false;
  const captionPositionOverride = buildCaptionPositionOverride(options);
  const activeWordPrefix = captionPositionOverride ? `{\\rActive${captionPositionOverride}}` : '{\\rActive}';
  const defaultWordPrefix = captionPositionOverride ? `{\\rDefault${captionPositionOverride}}` : '{\\rDefault}';

  let defaultStyleLine = '';
  let activeStyleLine = '';

  if (presetName === 'steady_bold') {
    defaultStyleLine = 'Style: Default,Impact,95,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6.0,0,2,10,10,800,1';
    activeStyleLine = `Style: Active,Impact,95,${highlightColorAss},&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6.0,0,2,10,10,800,1`;
  } else if (presetName === 'cyber_glow') {
    defaultStyleLine = 'Style: Default,Arial Black,90,&H00E0E0E0,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3.0,0,2,10,10,800,1';
    activeStyleLine = `Style: Active,Arial Black,90,${highlightColorAss},&H00FFFFFF,&H00000000,${highlightColorAss},-1,0,0,0,100,100,0,0,1,4.0,5.0,2,10,10,800,1`;
  } else {
    // default/word_pop: Box highlight style
    defaultStyleLine = 'Style: Default,Arial Black,90,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6.0,0,2,10,10,800,1';
    activeStyleLine = `Style: Active,Arial Black,90,&H00FFFFFF,&H00FFFFFF,&H00000000,${highlightColorAss},-1,0,0,0,100,100,0,0,3,0,0,2,10,10,800,1`;
  }

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    defaultStyleLine,
    activeStyleLine,
    // Hook style settings: Arial Black, Size 90, Outline 6px Black, Alignment 8 (Centered Top), MarginV 150 (distance from top)
    'Style: Hook,Arial Black,90,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6.0,0,8,10,10,150,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');

  const assLines = [];

  // Extract all words from transcription
  let words = [];
  if (whisperData.segments) {
    for (const seg of whisperData.segments) {
      if (seg.words && seg.words.length > 0) {
        words.push(...seg.words);
      }
    }
  }

  // Filter words that fit within the clip range while keeping boundary words that overlap the clip.
  let clipWords = words
    .map((word) => ({
      ...word,
      start: Math.max(word.start, clipStart),
      end: Math.min(word.end, clipEnd)
    }))
    .filter((word) => word.end > word.start && word.end > clipStart && word.start < clipEnd);

  // Fallback: if no word timestamps, estimate word timings from segment durations
  if (clipWords.length === 0) {
    const segments = whisperData.segments || [];
    const clipSegments = segments.filter(seg => seg.start < clipEnd && seg.end > clipStart);

    for (const seg of clipSegments) {
      const segStart = Math.max(seg.start, clipStart);
      const segEnd = Math.min(seg.end, clipEnd);
      const segDuration = segEnd - segStart;
      const cleanText = seg.text.trim();
      if (!cleanText) continue;

      const segWords = cleanText.split(/\s+/);
      if (segWords.length === 0) continue;

      const wordDuration = segDuration / segWords.length;
      for (let i = 0; i < segWords.length; i++) {
        clipWords.push({
          word: segWords[i],
          start: segStart + (i * wordDuration),
          end: segStart + ((i + 1) * wordDuration)
        });
      }
    }
  }

  if (clipWords.length > 0) {
    // Group words by timing with a soft cap of 3 words per screen.
    const groups = [];
    let currentGroup = [];
    let currentGroupStart = null;
    let currentGroupEnd = null;
    const MAX_GROUP_WORDS = 3;
    const MAX_SILENCE = 0.6;
    const MAX_GROUP_DURATION = 1.35;

    const flushGroup = () => {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      currentGroupStart = null;
      currentGroupEnd = null;
    };

    for (let i = 0; i < clipWords.length; i++) {
      const word = clipWords[i];
      const prevWord = currentGroup[currentGroup.length - 1];
      const timeGap = prevWord ? (word.start - prevWord.end) : 0;
      const groupDuration = currentGroupStart === null ? 0 : (word.end - currentGroupStart);

      if (currentGroup.length > 0 && (
        currentGroup.length >= MAX_GROUP_WORDS ||
        timeGap > MAX_SILENCE ||
        groupDuration > MAX_GROUP_DURATION
      )) {
        flushGroup();
      }

      if (currentGroup.length === 0) {
        currentGroupStart = word.start;
      }

      currentGroup.push(word);
      currentGroupEnd = word.end;
    }
    flushGroup();

    // Build dialogue lines for each word in each group
    for (const group of groups) {
      for (let i = 0; i < group.length; i++) {
        const activeWord = group[i];
        
        const clipDuration = Math.max(0.01, clipEnd - clipStart);
        const startSec = Math.max(0, activeWord.start - clipStart);
        const wordDuration = Math.max(0.16, Math.min(0.3, activeWord.end - activeWord.start));
        const nextStartSec = i < group.length - 1 ? group[i + 1].start - clipStart : clipDuration;
        const fallbackEndSec = Math.min(clipDuration, startSec + wordDuration + 0.08);

        // Keep the highlight visible long enough for the pop animation without making the event too short.
        let endSec = Math.max(startSec + 0.16, Math.min(nextStartSec - 0.01, fallbackEndSec));
        if (i === group.length - 1) {
          endSec = Math.max(endSec, Math.min(clipDuration, startSec + wordDuration + 0.16));
        }

        if (endSec <= startSec) {
          endSec = Math.min(clipDuration, startSec + 0.16);
        }

        const startTimeStr = formatAssTime(startSec);
        const endTimeStr = formatAssTime(endSec);

        // Build the text showing all words in the group, swapping active/default styles
        const lineParts = [];
        for (let j = 0; j < group.length; j++) {
          const w = group[j];
          const wordText = cleanWordText(w.word);
          if (!wordText) continue;

          if (j === i) {
            // Active word: switch style to Active
            lineParts.push(`${activeWordPrefix}${wordText}`);
          } else {
            // Inactive words: reset to Default
            lineParts.push(`${defaultWordPrefix}${wordText}`);
          }
        }

        const lineText = escapeAssText(lineParts.join(' '));
        if (lineText) {
          const normalizedText = lineText.replace(/\s+/g, ' ').trim();
          if (normalizedText && startTimeStr !== endTimeStr) {
            assLines.push(`Dialogue: 0,${startTimeStr},${endTimeStr},Default,,0,0,0,,${normalizedText}`);
          }
        }
      }
    }
  }

  // Render hook text overlay at the top of the video for the first 4 seconds if requested
  if (burnHook && hookText && hookText.trim()) {
    const hookTextClean = hookText.trim().replace(/["]/g, "").toUpperCase();
    const hookDuration = 4.0;
    const hookStartStr = formatAssTime(0);
    const hookEndStr = formatAssTime(Math.min(clipEnd - clipStart, hookDuration));
    assLines.push(`Dialogue: 1,${hookStartStr},${hookEndStr},Hook,,0,0,0,,${hookTextClean}`);
  }

  return header + '\n' + assLines.join('\n');
}

module.exports = {
  formatAssTime,
  generateAssForClip
};
