$env:NODE_OPTIONS = ""
Start-Process -FilePath node -ArgumentList 'node_modules\next\dist\bin\next start -p 3000' -RedirectStandardOutput server.out -RedirectStandardError server.err -WorkingDirectory 'C:\Bazarey2.0\Meat Delivery' -PassThru -NoNewWindow
Start-Sleep -Seconds 12
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/orders/1/print-pos" -Method Post -UseBasicParsing -TimeoutSec 30
    Write-Output "HTTP=$($r.StatusCode)"
    Write-Output "BODY=$($r.Content)"
} catch {
    Write-Output "ERR: $($_.Exception.Message)"
}
Start-Sleep -Seconds 2
Write-Output "---STDERR---"
Get-Content server.err -ErrorAction SilentlyContinue | Select-Object -Last 30
Write-Output "---STDOUT---"
Get-Content server.out -ErrorAction SilentlyContinue | Select-Object -Last 10