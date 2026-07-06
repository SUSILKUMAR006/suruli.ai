# AI YouTube Shorts Generator (Local Only)

A personal web application that automatically cuts landscape YouTube videos into engaging 9:16 vertical YouTube Shorts with burned-in captions, using Python Whisper for transcription and Groq LLM for identifying hooks and clips.

## Prerequisites

Ensure you have the following installed on your machine:

1. **Node.js** (v18+)
2. **Python** (3.10+)
3. **FFmpeg** (Must be in your system's PATH)

## Setup Instructions

### 1. Install Node.js Dependencies

From the project root directory, run the command:
```bash
npm run install-deps
```
This will install all dependencies for the root, backend (`server/`), and frontend (`client/`).

### 2. Install Python Dependencies

The transcriber requires Python packages including `yt-dlp` and `openai-whisper` (along with PyTorch). Run:
```bash
pip install yt-dlp openai-whisper torch
```
*Note: The Whisper library will download the `base` model (~140MB) to your machine on its first run.*

### 3. Setup Environment Variables

The application contains a `.env` file in the root directory.
Ensure your Groq API key is set (it has been configured automatically):
```env
PORT=5000
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
WHISPER_MODEL=base
```

## Running the Application

To start both the backend server and the frontend client concurrently, run:
```bash
npm start
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
