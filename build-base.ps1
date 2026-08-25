# Rebuild the meat business from scratch via the API
$base = "http://localhost:3000/api"

# ---------- 1. Settings: keep defaults but verify ----------
Write-Output "=== Settings (already seeded) ==="
$set = Invoke-RestMethod -Uri "$base/settings"
Write-Output ("  Business: " + $set.businessName)

# ---------- 2. Suppliers ----------
Write-Output "`n=== Adding supplier: Deshi Shadh (Zia Uddin) ==="
$supBody = @{
    name = "Deshi Shadh"
    contact = "Zia Uddin"
    phone = "01851046310"
    address = "Dhaka Metro"
    category = "beef,mutton"
    paymentTerms = "Cash on delivery"
    notes = ""
} | ConvertTo-Json
try {
    $sup = Invoke-RestMethod -Uri "$base/suppliers" -Method Post -ContentType "application/json" -Body $supBody
    $supId = $sup.id
    Write-Output ("  Added supplier id=" + $supId + " Zia Uddin")
} catch {
    Write-Output ("  Supplier exists; finding by name")
    $all = Invoke-RestMethod -Uri "$base/suppliers"
    $supId = ($all | Where-Object { $_.name -eq "Deshi Shadh" })[0].id
    Write-Output ("  Found id=" + $supId)
}

# ---------- 3. Products ----------
Write-Output "`n=== Adding products ==="
$deshiMutton = @{
    sku = "DESHI-MUTTON"
    name = "Deshi Mutton"
    nameBn = "দেশি খাসির মাংস"
    category = "mutton"
    unit = "kg"
    costPrice = 850
    sellPrice = 895
    marketPrice = 1200
    stockQty = 0
    reorderLevel = 5
} | ConvertTo-Json
$beef = @{
    sku = "BEEF"
    name = "Beef"
    nameBn = "গরুর মাংস"
    category = "beef"
    unit = "kg"
    costPrice = 0
    sellPrice = 0
    marketPrice = 0
    stockQty = 0
    reorderLevel = 5
} | ConvertTo-Json
$dm = Invoke-RestMethod -Uri "$base/products" -Method Post -ContentType "application/json" -Body $deshiMutton
$prodId = $dm.id
Write-Output ("  Added product: " + $dm.name + " id=" + $dm.id)
try {
    $bf = Invoke-RestMethod -Uri "$base/products" -Method Post -ContentType "application/json" -Body $beef
    Write-Output ("  Added product: " + $bf.name + " id=" + $bf.id)
} catch {
    Write-Output ("  Beef product already exists")
}

# ---------- 4. Rider ----------
Write-Output "`n=== Adding rider: Mehedi Hasan ==="
$rider = @{
    name = "Mehedi Hasan"
    phone = "01406080230"
    vehicle = "Bicycle"
    status = "active"
} | ConvertTo-Json
try {
    $r = Invoke-RestMethod -Uri "$base/riders" -Method Post -ContentType "application/json" -Body $rider
    $riderId = $r.id
    Write-Output ("  Added rider id=" + $riderId)
} catch {
    $all = Invoke-RestMethod -Uri "$base/riders"
    $riderId = ($all | Where-Object { $_.name -like "*Mehedi*" })[0].id
    Write-Output ("  Rider already exists; id=" + $riderId)
}

# ---------- 5. Purchase Order: 19.5 kg mutton from Zia Uddin ----------
Write-Output "`n=== Creating PO for 19.5 kg mutton ==="
$poBody = @{
    date = "2026-08-15"
    supplierId = $supId
    items = @(@{ productId = $prodId; qty = 19.5; unitCost = 850 })
    expectedDate = "2026-08-15"
    note = "Initial purchase"
} | ConvertTo-Json -Depth 6
$po = Invoke-RestMethod -Uri "$base/purchase-orders" -Method Post -ContentType "application/json" -Body $poBody
Write-Output ("  Created PO: " + $po.poNumber + " id=" + $po.id)

# Mark PO as received (will add stock)
$stBody = @{ status = "received" } | ConvertTo-Json
$poR = Invoke-RestMethod -Uri "$base/purchase-orders/$($po.id)" -Method Put -ContentType "application/json" -Body $stBody
Write-Output ("  PO marked received. New stock of product " + $prodId + " should be 19.5 kg")

Write-Output "`n=== Done with stock/supplier/rider/PO ==="
Write-Output "Product id (for orders): " + $prodId
Write-Output "Supplier id: " + $supId
Write-Output "Rider id: " + $riderId
Write-Output ""
Write-Output "Now give me the 6 today's orders (MD-2026-0006 through 0011) so I can add them."