# Add 20 kg PO from Zia Uddin, then create 6 today's orders
$base = "http://localhost:3000/api"

Write-Output "=== Add PO for 20 kg more mutton ==="
# Deshi Mutton is product id 1, Zia Uddin supplier id 4
$poBody = @{
    date = "2026-08-16"
    supplierId = 4
    items = @(@{ productId = 1; qty = 20; unitCost = 850 })
    expectedDate = "2026-08-16"
    note = "Second PO today"
} | ConvertTo-Json -Depth 6
$po = Invoke-RestMethod -Uri "$base/purchase-orders" -Method Post -ContentType "application/json" -Body $poBody
Write-Output ("  Created PO: " + $po.poNumber + " id=" + $po.id)

# Mark as received to add stock immediately
$stBody = @{ status = "received" } | ConvertTo-Json
$poR = Invoke-RestMethod -Uri "$base/purchase-orders/$($po.id)" -Method Put -ContentType "application/json" -Body $stBody
Write-Output ("  PO received. New stock should be 23.5 kg")

$p = Invoke-RestMethod -Uri "$base/products"
foreach ($prod in $p) {
    Write-Output ("  Current stock: " + $prod.name + " = " + $prod.stockQty + " " + $prod.unit)
}

Write-Output "`n=== Creating 6 today's orders ==="
# 14 kg total demand, all Mehedi, all own delivery, all paid (most likely)
$todayOrders = @(
    @{
        orderNo = "MD-2026-0006"
        date = "2026-08-16"
        customerName = "Irteza Zulfiquer Arif"
        customerPhone = "01755531565"
        area = "Mirpur DOHS"
        address = "House 241-243 Road 3 Avenue 3, Mirpur DOHS"
        qty = 1
        unitPrice = 895
        paid = 0
        riderId = 1
        deliveryMode = "own"
        note = ""
        confirmedAt = "2026-08-16T05:30:00.000Z"
        deliveredAt = ""
    },
    @{
        orderNo = "MD-2026-0007"
        date = "2026-08-16"
        customerName = "Habib Rahman"
        customerPhone = "01715025513"
        area = "Uttara Sector 7"
        address = "SC 7 ro 9b ho 7 uttora dhaka"
        qty = 5
        unitPrice = 895
        paid = 0
        riderId = 1
        deliveryMode = "own"
        note = ""
        confirmedAt = "2026-08-16T05:30:00.000Z"
        deliveredAt = ""
    },
    @{
        orderNo = "MD-2026-0008"
        date = "2026-08-16"
        customerName = "Monilal"
        customerPhone = "01711549532"
        area = "Tejgaon"
        address = "49 Monipuripara, Tejgaon, Dhaka, Flat A2"
        qty = 1
        unitPrice = 895
        paid = 0
        riderId = 1
        deliveryMode = "own"
        note = ""
        confirmedAt = "2026-08-16T05:30:00.000Z"
        deliveredAt = ""
    },
    @{
        orderNo = "MD-2026-0009"
        date = "2026-08-16"
        customerName = "sayeed"
        customerPhone = "01745255594"
        area = "Bashundhara R/A"
        address = "House#645 Road#22 Block -J Bashundhara residential area Dhaka"
        qty = 2
        unitPrice = 895
        paid = 0
        riderId = 1
        deliveryMode = "own"
        note = "after 3pm"
        confirmedAt = "2026-08-16T05:30:00.000Z"
        deliveredAt = ""
    },
    @{
        orderNo = "MD-2026-0010"
        date = "2026-08-16"
        customerName = "Abu nasher"
        customerPhone = "01713628669"
        area = "Wari"
        address = "9 Gupi Kison Ware Flat G7"
        qty = 3
        unitPrice = 895
        paid = 0
        riderId = 1
        deliveryMode = "own"
        note = ""
        confirmedAt = "2026-08-16T05:30:00.000Z"
        deliveredAt = ""
    },
    @{
        orderNo = "MD-2026-0011"
        date = "2026-08-16"
        customerName = "Md.Ariful Huq"
        customerPhone = "01767695891"
        area = "Shantinagar"
        address = "147 Shantinagar Dhaka Near Eastern plus shopping centre"
        qty = 2
        unitPrice = 895
        paid = 0
        riderId = 1
        deliveryMode = "own"
        note = ""
        confirmedAt = "2026-08-16T05:30:00.000Z"
        deliveredAt = ""
    }
)

foreach ($o in $todayOrders) {
    Write-Output ("--- " + $o.orderNo + " ---")
    $body = @{
        date = $o.date
        customerId = $null
        customerName = $o.customerName
        customerPhone = $o.customerPhone
        area = $o.area
        address = $o.address
        items = @(@{ productId = 1; qty = $o.qty; unitPrice = $o.unitPrice })
        deliveryFee = 100
        discount = 0
        paid = $o.paid
        paymentMethod = "cod"
        source = "facebook"
        deliveryMode = $o.deliveryMode
        pathaoTrackingId = ""
        pathaoFare = 0
        note = $o.note
    } | ConvertTo-Json -Depth 6
    $r = Invoke-RestMethod -Uri "$base/orders" -Method Post -ContentType "application/json" -Body $body
    Write-Output ("  Created id=" + $r.order.id + " total=" + $r.order.total + " (stock auto-deducted)")
    # Assign rider
    if ($o.riderId) {
        $riderBody = @{ riderId = $o.riderId } | ConvertTo-Json
        $r2 = Invoke-RestMethod -Uri "$base/orders/$($r.order.id)" -Method Put -ContentType "application/json" -Body $riderBody
    }
    # Set status to confirmed (which is already 'new' status... wait, order just created as 'new')
    # Actually order is in 'new' status; need to transition through statuses
    # We'll handle timestamps via /backdate below
}

Write-Output "`n=== Confirming all 6 orders + backdating timestamps ==="
$finalOrders = Invoke-RestMethod -Uri "$base/orders"
foreach ($o in $todayOrders) {
    $created = $finalOrders | Where-Object { $_.customerName -eq $o.customerName -and $_.qty -eq $o.qty -and $_.date -eq "2026-08-16" } | Select-Object -First 1
    if ($created) {
        # Set status to confirmed
        $confBody = @{ status = "confirmed" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$base/orders/$($created.id)" -Method Put -ContentType "application/json" -Body $confBody | Out-Null
        # Backdate confirmedAt
        $bdBody = @{ confirmedAt = $o.confirmedAt } | ConvertTo-Json
        Invoke-RestMethod -Uri "$base/orders/$($created.id)/backdate" -Method Post -ContentType "application/json" -Body $bdBody | Out-Null
        Write-Output ("  " + $o.orderNo + " → confirmed (backdated)")
    }
}

Write-Output "`n=== Final state ==="
$final = Invoke-RestMethod -Uri "$base/orders"
foreach ($o in $final | Sort-Object id) {
    Write-Output ("  id=" + $o.id + " | " + $o.orderNo + " | " + $o.status + " | " + $o.customerName + " | stock-deducted")
}

$p = Invoke-RestMethod -Uri "$base/products"
foreach ($prod in $p) {
    Write-Output ("  Stock: " + $prod.name + " = " + $prod.stockQty + " " + $prod.unit)
}

Write-Output "`n=== Today's dashboard ==="
$d = Invoke-RestMethod -Uri "$base/dashboard"
Write-Output ($d.today | ConvertTo-Json)