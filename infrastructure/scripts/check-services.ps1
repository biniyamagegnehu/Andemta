<#
.SYNOPSIS
  Checks local connectivity to PostgreSQL and Redis for Andemta development.
.DESCRIPTION
  Verifies that PostgreSQL (Windows port 5432) and Redis (WSL2/localhost port 6379)
  are listening and accessible before running the application.
#>

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Andemta Local Service Verification Tool   " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check PostgreSQL on localhost:5432
Write-Host "[1/2] Checking PostgreSQL on localhost:5432..." -NoNewline
try {
  $pgTcp = New-Object System.Net.Sockets.TcpClient
  $pgConnect = $pgTcp.BeginConnect("localhost", 5432, $null, $null)
  $pgSuccess = $pgConnect.AsyncWaitHandle.WaitOne(1500, $false)

  if ($pgSuccess -and $pgTcp.Connected) {
    $pgTcp.EndConnect($pgConnect)
    $pgTcp.Close()
    Write-Host " [ONLINE]" -ForegroundColor Green
  } else {
    Write-Host " [OFFLINE]" -ForegroundColor Yellow
    Write-Host "      PostgreSQL is not listening on port 5432." -ForegroundColor DarkYellow
    Write-Host "      Ensure PostgreSQL service is running in Windows Services (services.msc)." -ForegroundColor DarkGray
  }
} catch {
  Write-Host " [ERROR]" -ForegroundColor Red
  Write-Host "      Error checking PostgreSQL: $_" -ForegroundColor Red
}

# 2. Check Redis on localhost:6379
Write-Host "[2/2] Checking Redis on localhost:6379..." -NoNewline
try {
  $redisTcp = New-Object System.Net.Sockets.TcpClient
  $redisConnect = $redisTcp.BeginConnect("localhost", 6379, $null, $null)
  $redisSuccess = $redisConnect.AsyncWaitHandle.WaitOne(1500, $false)

  if ($redisSuccess -and $redisTcp.Connected) {
    $redisTcp.EndConnect($redisConnect)
    $redisTcp.Close()
    Write-Host " [ONLINE]" -ForegroundColor Green
  } else {
    Write-Host " [OFFLINE]" -ForegroundColor Yellow
    Write-Host "      Redis is not listening on port 6379." -ForegroundColor DarkYellow
    Write-Host "      Start Redis in WSL2: 'wsl sudo service redis-server start'" -ForegroundColor DarkGray
  }
} catch {
  Write-Host " [ERROR]" -ForegroundColor Red
  Write-Host "      Error checking Redis: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Service check finished." -ForegroundColor Cyan

