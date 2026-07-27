import sys
import argparse
import json
import os

def transcribe(audio_path, output_json, output_txt, model_name="base"):
    try:
        print(f"Loading Whisper model '{model_name}'...")
        import whisper
        import torch
        
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {device}")
        
        # Load whisper model
        model = whisper.load_model(model_name, device=device)
        
        print("Transcribing audio (this may take a moment)...")
        # Run transcription with word-level timestamps
        result = model.transcribe(audio_path, word_timestamps=True)
        
        print(f"Transcription finished. Writing JSON metadata to {output_json}...")
        # Write full JSON result
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            
        print(f"Writing simplified transcript text to {output_txt}...")
        # Write simplified timestamp text file for LLM
        with open(output_txt, 'w', encoding='utf-8') as f:
            for segment in result.get('segments', []):
                start = segment.get('start', 0.0)
                end = segment.get('end', 0.0)
                text = segment.get('text', '').strip()
                # Format: [start_seconds-end_seconds] Text (using integers to save tokens)
                f.write(f"[{int(start)}-{int(end)}] {text}\n")
                
        print("Whisper transcription process completed successfully.")
        return True
    except Exception as e:
        print(f"Error during transcription: {str(e)}", file=sys.stderr)
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Locally transcribe audio using OpenAI Whisper.")
    parser.add_argument("--audio", required=True, help="Path to input audio file")
    parser.add_argument("--output", required=True, help="Path to output JSON file")
    parser.add_argument("--text-output", required=True, help="Path to output TXT file")
    parser.add_argument("--model", default="base", help="Whisper model name (tiny, base, small, medium, large)")
    
    args = parser.parse_args()
    
    success = transcribe(args.audio, args.output, args.text_output, args.model)
    if not success:
        sys.exit(1)
