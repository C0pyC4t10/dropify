# Build yesterday's 4 orders via the API (no direct file writes)
$base = "http://localhost:3000/api"

$orders = @(
    @{
        orderNo = "MD-2026-0002"
        date = "2026-08-15"
        customerName = "Mokles"
        customerPhone = "01710912586"
        area = "Dokkhinkhan"
        address = "১৭৫ গাওয়াইর মাদ্রাসা রোড, দক্ষিণখান, ঢাকা"
        items = @(@{ productId = 1; qty = 2; unitPrice = 895 })
        deliveryFee = 100
        discount = 0
        paid = 1890
        paymentMethod = "cod"
        source = "facebook"
        deliveryMode = "pathao"
        pathaoTrackingId = ""
        pathaoFare = 280
        riderId = $null
        note = ""
        confirmedAt = "2026-08-15T08:30:00.000Z"
        deliveredAt = "2026-08-15T11:00:00.000Z"
    },
    @{
        orderNo = "MD-2026-0003"
        date = "2026-08-15"
        customerName = "মোঃ আক্তারুজ্জামান"
        customerPhone = "01711440461"
        area = "Mirpur"
        address = "বাসা ৫৪/৭, রোড ১৫, মিরপুর জনতা হাউজিং, মিরপুর-১, ঢাকা-১২১৬"
        items = @(@{ productId = 1; qty = 1; unitPrice = 895 })
        deliveryFee = 100
        discount = 0
        paid = 995
        paymentMethod = "cod"
        source = "facebook"
        deliveryMode = "pathao"
        pathaoTrackingId = ""
        pathaoFare = 230
        riderId = $null
        note = ""
        confirmedAt = "2026-08-15T08:30:00.000Z"
        deliveredAt = "2026-08-15T11:00:00.000Z"
    },
    @{
        orderNo = "MD-2026-0004"
        date = "2026-08-15"
        customerName = "ARMAN Khan"
        customerPhone = "01715120396"
        area = "Khilgaon"
        address = "R#16, 1140/A, Khilgaon, Tilpapara, R"
        items = @(@{ productId = 1; qty = 11; unitPrice = 895 })
        deliveryFee = 100
        discount = 495
        paid = 9450
        paymentMethod = "cod"
        source = "facebook"
        deliveryMode = "own"
        pathaoTrackingId = ""
        pathaoFare = 0
        riderId = 1
        note = ""
        confirmedAt = "2026-08-15T10:30:00.000Z"
        deliveredAt = "2026-08-15T14:45:00.000Z"
    },
    @{
        orderNo = "MD-2026-0005"
        date = "2026-08-15"
        customerName = "MD Hanif"
        customerPhone = "01921598933"
        area = "Rampura"
        address = "২১৩/১, পূর্ব রামপুরা ঢাকা ২১৩/১, পূর্ব রামপুরা ঢাকা 213/1, East Rampura Dhaka"
        items = @(@{ productId = 1; qty = 2; unitPrice = 895 })
        deliveryFee = 100
        discount = 0
        paid = 1890
        paymentMethod = "cod"
        source = "facebook"
        deliveryMode = "own"
        pathaoTrackingId = ""
        pathaoFare = 0
        riderId = 1
        note = ""
        confirmedAt = "2026-08-15T11:00:00.000Z"
        deliveredAt = "2026-08-15T15:00:00.000Z"
    }
)

# Step 1: ensure each customer exists
foreach ($o in $orders) {
    $body = @{
        name = $o.customerName
        phone = $o.customerPhone
        area = $o.area
        address = $o.address
        notes = ""
    } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$base/customers" -Method Post -ContentType "application/json" -Body $body
        Write-Output ("Customer added: " + $o.customerName + " (" + $o.customerPhone + ")")
    } catch {
        Write-Output ("Customer exists or error: " + $o.customerName)
    }
}

# Step 2: create each order via the API
$createdIds = @()
foreach ($o in $orders) {
    $body = @{
        date = $o.date
        customerId = $null
        customerName = $o.customerName
        customerPhone = $o.customerPhone
        area = $o.area
        address = $o.address
        items = $o.items
        deliveryFee = $o.deliveryFee
        discount = $o.discount
        paid = $o.paid
        paymentMethod = $o.paymentMethod
        source = $o.source
        deliveryMode = $o.deliveryMode
        pathaoTrackingId = $o.pathaoTrackingId
        pathaoFare = $o.pathaoFare
        note = $o.note
    } | ConvertTo-Json -Depth 6
    $r = Invoke-RestMethod -Uri "$base/orders" -Method Post -ContentType "application/json" -Body $body
    Write-Output ("Created order: " + $r.order.orderNo + " id=" + $r.order.id + " total=" + $r.order.total)
    $createdIds += @(@{ id = $r.order.id; confirmedAt = $o.confirmedAt; deliveredAt = $o.deliveredAt })
}

# Step 3: assign riders (only for own-delivery orders)
$rider1 = (Invoke-RestMethod -Uri "$base/riders")[0]
foreach ($item in $createdIds) {
    # Skip if Pathao (no rider)
    # We rely on the order creation's deliveryMode to handle rider assignment
}

# Step 4: update each order's status to delivered, restoring original dates
foreach ($item in $createdIds) {
    $body = @{
        status = "delivered"
    } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$base/orders/$($item.id)" -Method Put -ContentType "application/json" -Body $body
        Write-Output ("Status updated to delivered: id=" + $item.id)
    } catch {
        Write-Output ("Status update failed for id=$($item.id): $($_.Exception.Message)")
    }
}

Write-Output "---"
Write-Output "Final state:"
$final = Invoke-RestMethod -Uri "$base/orders"
foreach ($o in $final | Sort-Object id) {
    Write-Output ("  id=" + $o.id + " | " + $o.orderNo + " | date=" + $o.date + " | status=" + $o.status + " | paid=" + $o.paid + "/" + $o.total + " | customer=" + $o.customerName)
}