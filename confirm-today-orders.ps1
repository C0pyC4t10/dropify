# Confirm status + backdate timestamps for the 6 orders I just created (ids 5-10)
$base = "http://localhost:3000/api"

# (orderId, confirmedAt, deliveredAt)
$orders = @(
    @{ id = 5; confirmedAt = "2026-08-16T05:30:00.000Z"; deliveredAt = "" },         # 0006 not delivered yet
    @{ id = 6; confirmedAt = "2026-08-16T05:30:00.000Z"; deliveredAt = "" },
    @{ id = 7; confirmedAt = "2026-08-16T05:30:00.000Z"; deliveredAt = "" },
    @{ id = 8; confirmedAt = "2026-08-16T05:30:00.000Z"; deliveredAt = "" },         # after 3pm, not delivered
    @{ id = 9; confirmedAt = "2026-08-16T05:30:00.000Z"; deliveredAt = "" },
    @{ id = 10; confirmedAt = "2026-08-16T05:30:00.000Z"; deliveredAt = "" }
)

foreach ($o in $orders) {
    Write-Output ("--- id=" + $o.id + " ---")
    # Move status to confirmed
    $body = @{ status = "confirmed" } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$base/orders/$($o.id)" -Method Put -ContentType "application/json" -Body $body
        Write-Output ("  Status: " + $r.status)
    } catch {
        Write-Output ("  Status error: " + $_.Exception.Message)
    }
    # Backdate confirmedAt
    $bdBody = @{ confirmedAt = $o.confirmedAt } | ConvertTo-Json
    try {
        $r2 = Invoke-RestMethod -Uri "$base/orders/$($o.id)/backdate" -Method Post -ContentType "application/json" -Body $bdBody
        Write-Output ("  ConfirmedAt: " + $r2.confirmedAt)
    } catch {
        Write-Output ("  Backdate error: " + $_.Exception.Message)
    }
}

Write-Output "`n=== Final state ==="
$final = Invoke-RestMethod -Uri "$base/orders"
foreach ($o in $final | Sort-Object id) {
    Write-Output ("  id=" + $o.id + " | " + $o.orderNo + " | " + $o.status + " | confirmed=" + $o.confirmedAt)
}

$p = Invoke-RestMethod -Uri "$base/products"
foreach ($prod in $p) {
    Write-Output ("  Stock: " + $prod.name + " = " + $prod.stockQty + " " + $prod.unit)
}

Write-Output "`n=== Today's dashboard ==="
$d = Invoke-RestMethod -Uri "$base/dashboard"
Write-Output ($d.today | ConvertTo-Json)