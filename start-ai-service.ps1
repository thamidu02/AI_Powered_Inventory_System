# start-ai-service.ps1
# Run this in a SEPARATE terminal to start the Python AI service
Write-Host "Starting Inventory AI Service on http://localhost:8000..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\ai-service"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
