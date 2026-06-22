# Agent Instructions

This project has strict API rate limit constraints (NVIDIA NIM / Ollama free tier, 40 RPM max). To prevent hitting the rate limit, follow these rules:

## API Rate Limiting Rules
- You **MUST** run the rate limiter script before starting any heavy loops, batch operations, or consecutive code edits:
  ```bash
  node C:\Users\manit\.config\opencode\skills\api-rate-manager\rpm_tracker.js
  ```
- Always keep request volume between 35 and 38 RPM.
- If the rate limiter warns you and pauses, wait patiently for the sleep timer to finish.
