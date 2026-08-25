$base = "http://localhost:3000/api"
$skuSuffix = "-R"

function Post-Json($path, $body) {
    $json = $body | ConvertTo-Json -Depth 6
    return Invoke-RestMethod -Uri "$base/$path" -Method Post -ContentType "application/json" -Body $json
}

# --- Products (17) ---
$products = @(
    @{ sku = "BEEF-BL";   name = "Beef Boneless";                nameBn = "গরুর মাংস বোনলেস";    category = "beef";    unit = "kg";  cost = 700; sell = 730; market = 800; stock = 40; reorder = 15 },
    @{ sku = "BEEF-MIX";  name = "Beef Mixed with Bone";         nameBn = "গরুর মাংস হাড়সহ";    category = "beef";    unit = "kg";  cost = 640; sell = 680; market = 750; stock = 30; reorder = 15 },
    @{ sku = "BEEF-RIB";  name = "Beef Ribs";                    nameBn = "গরুর পাঁজর";          category = "beef";    unit = "kg";  cost = 720; sell = 770; market = 820; stock = 12; reorder = 8 },
    @{ sku = "BEEF-LIV";  name = "Beef Liver";                   nameBn = "গরুর কলিজা";          category = "offal";   unit = "kg";  cost = 260; sell = 300; market = 320; stock = 6; reorder = 5 },
    @{ sku = "BEEF-KEEMA";name = "Beef Keema";                   nameBn = "গরুর কিমা";            category = "beef";    unit = "kg";  cost = 740; sell = 780; market = 850; stock = 8; reorder = 8 },
    @{ sku = "CHK-SKIN";  name = "Broiler Chicken with Skin";    nameBn = "ব্রয়লার মুরগি চামড়াসহ"; category = "chicken"; unit = "kg"; cost = 170; sell = 245; market = 180; stock = 35; reorder = 20 },
    @{ sku = "CHK-NSKIN"; name = "Broiler Chicken without Skin"; nameBn = "ব্রয়লার মুরগি চামড়াছাড়া"; category = "chicken"; unit = "kg"; cost = 195; sell = 270; market = 200; stock = 25; reorder = 15 },
    @{ sku = "CHK-BREAST";name = "Chicken Breast Boneless";      nameBn = "মুরগির বুকের মাংস হাড়ছাড়া"; category = "chicken"; unit = "kg"; cost = 290; sell = 360; market = 340; stock = 15; reorder = 10 },
    @{ sku = "CHK-DRUM";  name = "Chicken Drumsticks";           nameBn = "মুরগির ড্রামস্টিক";    category = "chicken"; unit = "kg";  cost = 245; sell = 270; market = 260; stock = 18; reorder = 10 },
    @{ sku = "CHK-WING";  name = "Chicken Wings";                nameBn = "মুরগির ডানা";          category = "chicken"; unit = "kg";  cost = 190; sell = 220; market = 200; stock = 10; reorder = 8 },
    @{ sku = "CHK-KEEMA"; name = "Chicken Keema";                nameBn = "মুরগির কিমা";           category = "chicken"; unit = "kg";  cost = 330; sell = 390; market = 360; stock = 6; reorder = 6 },
    @{ sku = "CHK-LEG";   name = "Whole Chicken Leg with Skin";  nameBn = "মুরগির পুরো পা �ামড়াসহ"; category = "chicken"; unit = "kg"; cost = 175; sell = 340; market = 300; stock = 14; reorder = 8 },
    @{ sku = "CHK-GIB";   name = "Chicken Giblets Liver";        nameBn = "মুরগির কলিজা";          category = "offal";   unit = "kg";  cost = 130; sell = 150; market = 160; stock = 5; reorder = 5 },
    @{ sku = "CHK-SONALI";name = "Sonali Cock";                  nameBn = "সোনালি কক মুরগি";       category = "chicken"; unit = "kg";  cost = 320; sell = 340; market = 355; stock = 20; reorder = 10 },
    @{ sku = "MUT-BONE";  name = "Mutton with Bone";             nameBn = "খাসির মাংস হাড়সহ";     category = "mutton";  unit = "kg";  cost = 1150; sell = 1200; market = 1300; stock = 20; reorder = 10 },
    @{ sku = "MUT-BL";    name = "Mutton Boneless";              nameBn = "খাসির মাংস বোনলেস";    category = "mutton";  unit = "kg";  cost = 1320; sell = 1400; market = 1500; stock = 10; reorder = 8 },
    @{ sku = "FISH-HILSA";name = "Hilsa (400gm+)";               nameBn = "ইলিশ মাছ";             category = "fish";    unit = "kg";  cost = 1100; sell = 1200; market = 1300; stock = 25; reorder = 12 }
)

$created = @()
foreach ($p in $products) {
    $sku = $p.sku + $skuSuffix
    $body = @{
        sku = $sku
        name = $p.name
        nameBn = $p.nameBn
        category = $p.category
        unit = $p.unit
        costPrice = $p.cost
        sellPrice = $p.sell
        marketPrice = $p.market
        stockQty = $p.stock
        reorderLevel = $p.reorder
    }
    $r = Post-Json "products" $body
    $created += @{ sku = $sku; id = $r.id; name = $p.name }
}
Write-Output ("Created products: " + $created.Count)

# --- Customers (3) ---
$customers = @(
    @{ name = "Rahim Ahmed"; phone = "01711111111"; area = "Aftabnagar";    address = "House 5, Road 1, Aftabnagar";   notes = "Prefers evening delivery" },
    @{ name = "Karim Uddin"; phone = "01822222222"; area = "Badda";         address = "Flat 4A, Rupnagar, Badda";     notes = "" },
    @{ name = "Sadia Rahman";phone = "01933333333"; area = "Bashundhara R/A"; address = "Block B, Bashundhara";       notes = "Orders weekly on Friday" }
)
foreach ($c in $customers) {
    Post-Json "customers" $c | Out-Null
}
Write-Output ("Created customers: " + $customers.Count)

# --- Riders (3) ---
$riders = @(
    @{ name = "Mamun";  phone = "01611111111"; vehicle = "Motorbike"; status = "active" },
    @{ name = "Jahid";  phone = "01522222222"; vehicle = "Bicycle";   status = "active" },
    @{ name = "Sohel";  phone = "01733333333"; vehicle = "Motorbike"; status = "inactive" }
)
foreach ($r in $riders) {
    Post-Json "riders" $r | Out-Null
}
Write-Output ("Created riders: " + $riders.Count)

# --- One demo PO using the first supplier and first created product (CHK-SKIN-R) ---
$suppliers = Invoke-RestMethod -Uri "$base/suppliers"
$supplierId = $suppliers[0].id
$allProducts = Invoke-RestMethod -Uri "$base/products"
$chkProduct = $allProducts | Where-Object { $_.sku -eq "CHK-SKIN-R" }
$poBody = @{
    date = (Get-Date -Format "yyyy-MM-dd")
    supplierId = $supplierId
    items = @( @{ productId = $chkProduct.id; qty = 30; unitCost = 170 } )
    expectedDate = ""
    note = "Restock broiler for tomorrow morning"
}
$po = Post-Json "purchase-orders" $poBody
Write-Output ("Created PO: " + $po.poNumber + " for supplier " + $suppliers[0].name)

# --- Mark the demo PO as received so the new CHK-SKIN-R stock increments by 30 (proves stock-in works) ---
$statusBody = @{ status = "received" } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/purchase-orders/$($po.id)" -Method Put -ContentType "application/json" -Body $statusBody | Out-Null
Write-Output "PO marked received"

Write-Output "---FINAL STATE---"
$final = Get-Content data\db.json -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ("products=" + ($final.products.PSObject.Properties | Measure-Object).Count)
Write-Output ("customers=" + ($final.customers.PSObject.Properties | Measure-Object).Count)
Write-Output ("riders=" + ($final.riders.PSObject.Properties | Measure-Object).Count)
Write-Output ("suppliers=" + ($final.suppliers.PSObject.Properties | Measure-Object).Count)
Write-Output ("purchaseOrders=" + ($final.purchaseOrders.PSObject.Properties | Measure-Object).Count)