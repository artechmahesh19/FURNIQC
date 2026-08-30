$url = "https://script.google.com/macros/s/AKfycbyRos2ecAa0tcZOz3U2ou_N0xnNQbnygzWxDadsoQwbfpjGraX9ktpvOm6Wx1JN1bB-/exec"
try {
    $req = [System.Net.WebRequest]::Create($url)
    $req.AllowAutoRedirect = $false
    $resp = $req.GetResponse()
    Write-Host "StatusCode: " ([int]$resp.StatusCode)
    Write-Host "Location: " $resp.Headers["Location"]
    $resp.Close()
} catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($resp) {
        Write-Host "StatusCode: " ([int]$resp.StatusCode)
        Write-Host "Location: " $resp.Headers["Location"]
        $resp.Close()
    } else {
        Write-Host "Error: " $_.Exception.Message
    }
}

