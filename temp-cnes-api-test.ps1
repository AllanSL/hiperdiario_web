$headers = @{ 
  'Content-Type' = 'application/json'
}
$body = '{"ibge":"1703883","cnes":"2469588"}'
try {
  $r = Invoke-WebRequest -Uri 'https://ltlwvywjuodlftkpahfd.supabase.co/functions/v1/cnes_api' -Headers $headers -Method Post -Body $body -TimeoutSec 30
  Write-Output "STATUS:$($r.StatusCode)"
  Write-Output $r.Content
} catch {
  $err = $_.Exception
  if ($err.Response) {
    $resp = $err.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($resp)
    Write-Output "ERROR:$($err.Message)"
    Write-Output $reader.ReadToEnd()
  } else {
    Write-Output "ERROR:$($err.Message)"
  }
}
