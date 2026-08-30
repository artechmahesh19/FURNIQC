$excelPath = "QC REPORT  (1).xlsx"
$zipPath = Join-Path $env:TEMP "qc_report.zip"
$tempDir = Join-Path $env:TEMP "excel_inspect_dir"

if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Copy-Item $excelPath $zipPath
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

$ssPath = Join-Path $tempDir "xl\sharedStrings.xml"
if (Test-Path $ssPath) {
    [xml]$xmlData = Get-Content $ssPath
    Write-Host "=== SHARED STRINGS (Headers) ==="
    $nodes = $xmlData.GetElementsByTagName("t")
    for ($i = 0; $i -lt [Math]::Min(100, $nodes.Count); $i++) {
        Write-Host "$i : $($nodes.Item($i).InnerText)"
    }
}
Remove-Item $tempDir -Recurse -Force
Remove-Item $zipPath -Force
