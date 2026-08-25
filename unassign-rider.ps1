# Unassign Mehedi from today's 6 orders (you'll assign yourself)
$base = "http://localhost:3000/api"

foreach ($id in 5..10) {
    $body = @{ riderId = $null } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$base/orders/$id" -Method Put -ContentType "application/json" -Body $body
    Write-Output ("Order id=" + $id + " riderId=" + $r.riderId + " status=" + $r.status)
}

Write-Output "`n=== Final state ==="
$final = Invoke-RestMethod -Uri "$base/orders"
foreach ($o in $final | Sort-Object id) {
    Write-Output ("  id=" + $o.id + " | " + $o.orderNo + " | status=" + $o.status + " | riderId=" + $(if ($o.riderId) { $o.riderId } else { "null" }) + " | paid=" + $o.paid + "/" + $o.total)
}