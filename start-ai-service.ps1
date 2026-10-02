# start-ai-service.ps1
# Run this in a SEPARATE terminal to start the Python AI service
$aiServicePath = Join-Path $PSScriptRoot "ai-service"
$pythonPath = Join-Path $aiServicePath ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonPath)) {
	Write-Error "AI service virtual environment not found. Create it and install dependencies with: python -m venv ai-service\.venv; ai-service\.venv\Scripts\python.exe -m pip install -r ai-service\requirements.txt"
	exit 1
}

Set-Location $aiServicePath

& $pythonPath -c "from dotenv import load_dotenv; import os; load_dotenv(); raise SystemExit(0 if os.getenv('GEMINI_API_KEY', '').strip() else 1)"
if ($LASTEXITCODE -ne 0) {
	Write-Error "GEMINI_API_KEY is missing. Add GEMINI_API_KEY=your_key to ai-service\.env, then run this script again."
	exit 1
}

Write-Host "Starting Inventory AI Service on http://localhost:8001..." -ForegroundColor Cyan
& $pythonPath -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
