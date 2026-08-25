# Backdate + assign rider for the 4 yesterday's orders, all via the API.
$base = "http://localhost:3000/api"

# Mehedi Hasan rider id = 1
$riderId = 1

# Backdated timestamps per order
$orders = @(
    @{ id = 1; confirmedAt = "2026-08-15T08:30:00.000Z"; deliveredAt = "2026-08-15T11:00:00.000Z"; riderId = $null; mode = "pathao" }
    @{ id = 2; confirmedAt = "2026-08-15T08:30:00.000Z"; deliveredAt = "2026-08-15T11:00:00.000Z"; riderId = $null; mode = "pathao" }
    @{ id = 3; confirmedAt = "2026-08-15T10:30:00.000Z"; deliveredAt = "2026-08-15T14:45:00.000Z"; riderId = $riderId; mode = "own" }
    @{ id = 4; confirmedAt = "2026-08-15T11:00:00.000Z"; deliveredAt = "2026-08-15T15:00:00.000Z"; riderId = $riderId; mode = "own" }
)

foreach ($o in $orders) {
    Write-Output ("--- Order id=" + $o.id + " ---")

    # 1. Backdate timestamps via the new endpoint
    $body = @{
        confirmedAt = $o.confirmedAt
        deliveredAt = $o.deliveredAt
    } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$base/orders/$($o.id)/backdate" -Method Post -ContentType "application/json" -Body $body
    Write-Output ("  Backdated: confirmedAt=" + $r.confirmedAt + " deliveredAt=" + $r.deliveredAt)

    # 2. Assign rider (skip if null = Pathao)
    if ($o.riderId) {
        $riderBody = @{ riderId = $o.riderId } | ConvertTo-Json
        $r2 = Invoke-RestMethod -Uri "$base/orders/$($o.id)" -Method Put -ContentType "application/json" -Body $riderBody
        Write-Output ("  Rider assigned: " + $r2.riderId)
    }
}

Write-Output ""
Write-Output "=== Final state ==="
$final = Invoke-RestMethod -Uri "$base/orders"
foreach ($o in $final | Sort-Object id) {
    Write-Output ("  id=" + $o.id + " | " + $o.orderNo + " | date=" + $o.date + " | confirmed=" + $o.confirmedAt + " | delivered=" + $o.deliveredAt + " | status=" + $o.status + " | riderId=" + $o.riderId)
}

Write-Output ""
Write-Output "=== Dashboard today ==="
$d = Invoke-RestMethod -Uri "$base/dashboard"
Write-Output ("  " + ($d.today | ConvertTo-Json -Compress))
Write-Output "=== Riders page data ==="
$riders = Invoke-RestMethod -Uri "$base/riders"
foreach ($r in $riders) {
    Write-Output ("  Rider: id=" + $r.id + " name=" + $r.name)
}

Write-Output ""
Write-Output "=== Products / stock ==="
$prods = Invoke-RestMethod -Uri "$base/products"
foreach ($p in $prods) {
    Write-Output ("  " + $p.name + " | stock=" + $p.stockQty + " " + $p.unit)
}

Write-Output ""
Write-Output "=== Stock movements ==="
$mv = Invoke-RestMethod -Uri "$base/stock"
foreach ($m in $mv | Sort-Object id) {
    Write-Output ("  id=" + $m.id + " | productId=" + $m.productId + " | " + $m.type + " | qty=" + $m.qty + " | " + $m.note)
}