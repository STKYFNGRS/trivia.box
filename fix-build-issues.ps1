# Fix-build-issues.ps1
# Script to fix Next.js build issues for Trivia.Box

Write-Host "Starting Trivia.Box build issue fixes..." -ForegroundColor Cyan

# 1. Fix the route.ts file to remove created_at field
$routeFilePath = ".\src\app\api\game\session\route.ts"
Write-Host "Checking route.ts file for type errors..." -ForegroundColor Yellow

if (Test-Path $routeFilePath) {
    $content = Get-Content -Path $routeFilePath -Raw

    # Check if the file contains the problematic 'created_at' field
    if ($content -match 'created_at: new Date\(\)') {
        Write-Host "Found 'created_at' field issue, fixing..." -ForegroundColor Yellow
        
        # Replace the problematic line
        $newContent = $content -replace "player_count: 1,\s+current_index: 0,\s+created_at: new Date\(\),\s+", "player_count: 1,`r`n        current_index: 0,`r`n        "
        
        # Write the fixed content back to the file
        Set-Content -Path $routeFilePath -Value $newContent
        Write-Host "Fixed 'created_at' field issue in route.ts" -ForegroundColor Green
    } else {
        Write-Host "No 'created_at' field issue found in route.ts" -ForegroundColor Green
    }
} else {
    Write-Host "Warning: $routeFilePath not found" -ForegroundColor Red
}

# 2. Clean up Next.js build files to fix middleware manifest issue
Write-Host "Cleaning up Next.js build artifacts..." -ForegroundColor Yellow

# Remove .next directory completely
if (Test-Path ".\.next") {
    Remove-Item -Path ".\.next" -Recurse -Force
    Write-Host "Removed .next directory" -ForegroundColor Green
} else {
    Write-Host "No .next directory found" -ForegroundColor Yellow
}

# Clear any potential cache
if (Test-Path ".\node_modules\.cache") {
    Remove-Item -Path ".\node_modules\.cache" -Recurse -Force
    Write-Host "Cleared node_modules cache" -ForegroundColor Green
}

# 3. Rebuild the project
Write-Host "Rebuilding project..." -ForegroundColor Yellow
npm run build

Write-Host "Build process completed" -ForegroundColor Cyan
Write-Host "Try running 'npm run dev' now" -ForegroundColor Cyan
