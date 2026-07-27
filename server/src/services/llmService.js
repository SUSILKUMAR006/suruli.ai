const Groq = require('groq-sdk');
const fs = require('fs');

/**
 * Sends transcript text to the Groq LLM API and requests a list of engaging clips
 */
async function selectClips(transcriptText, clipLength, numberOfShorts, onLog, modelName) {
  onLog(`[PROCESS] Contacting Groq LLM for transcript analysis...`);

  const apiKey = process.env.GROQ_API_KEY;
  const finalModelName = modelName || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not defined in the environment variables.');
  }

  const groq = new Groq({ apiKey });

  const systemPrompt = `You are an expert AI video editor. Your task is to analyze video transcripts and identify the most engaging, high-impact, continuous segments to be cut into YouTube Shorts.

Output format:
You MUST respond with a JSON object. The JSON object must contain an array of objects called "clips".
Schema:
{
  "clips": [
    {
      "start": 12.5,
      "end": 42.0,
      "reason": "Why this segment is engaging (e.g., strong hook, joke, surprising fact)",
      "title": "A short, catchy, click-worthy title for the Short",
      "hook": "An attention-grabbing visual hook phrase (3-6 words) to display at the start of the video",
      "caption": "An engaging description/caption with popular hashtags (e.g. #shorts, #trending)"
    }
  ]
}

Strict Rules:
1. The duration of each clip (end - start) MUST be between 20 seconds and ${clipLength} seconds. Do not select any clips shorter than 20 seconds.
2. The start and end times must correspond closely to the timestamp ranges provided in the transcript.
3. Every clip must start with a strong hook and avoid long introductions, filler words, or awkward pauses.
4. Ensure selected segments are continuous (do not jump between different non-contiguous parts of the video).
5. Choose segments with high emotion, surprise, humor, conflict, valuable insights, or compelling storytelling.
6. Ensure that the clip start and end times align with the beginning and end of a complete sentence or thought, so that the clip does not cut off abruptly.
7. Return only the JSON object. Do not include any explanations before or after the JSON.`;

  // Slice transcript to first 15 minutes (900 seconds) to fit within LLM token/rate limits
  const lines = transcriptText.split('\n');
  const filteredLines = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d+(?:\.\d+)?)/);
    if (match) {
      const startSec = parseFloat(match[1]);
      if (startSec < 900) {
        filteredLines.push(line);
      } else {
        break; // Stop including lines past 15 minutes
      }
    } else {
      filteredLines.push(line);
    }
  }
  const slicedTranscriptText = filteredLines.join('\n');

  const userPrompt = `Analyze the transcript and identify up to ${numberOfShorts} of the most engaging clips.
Each clip must be between 20 and ${clipLength} seconds long.

Transcript:
${slicedTranscriptText}`;

  onLog(`[INFO] Sending prompt to Groq model: ${finalModelName}`);

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    model: finalModelName,
    // Enable JSON Mode to guarantee valid JSON response
    response_format: { type: 'json_object' },
    temperature: 0.3
  });

  const rawResponse = chatCompletion.choices[0].message.content;
  onLog(`[SUCCESS] Groq LLM response received.`);

  try {
    const data = JSON.parse(rawResponse);
    if (!data.clips || !Array.isArray(data.clips)) {
      throw new Error("Invalid response format: 'clips' array not found.");
    }
    onLog(`[INFO] Found ${data.clips.length} proposed clips.`);
    return data.clips;
  } catch (error) {
    onLog(`[ERROR] Failed to parse Groq response: ${rawResponse}`);
    throw new Error(`LLM output parsing failure: ${error.message}`);
  }
}

module.exports = {
  selectClips
};
