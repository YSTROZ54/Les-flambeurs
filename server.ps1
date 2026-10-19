$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "Serveur local demarre sur http://localhost:$port/"
} catch {
    Write-Host "Erreur lors du demarrage du listener: $_"
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".webp" = "image/webp"
}

$baseDir = $PSScriptRoot
if (-not $baseDir) { $baseDir = (Get-Location).Path }

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath)
        if ($urlPath -eq '/' -or $urlPath -eq '/index.html') {
            $urlPath = '/Les_Flambeurs.html'
        }

        # ENDPOINT BASE DE DONNEES : /api/accounts
        if ($urlPath -eq '/api/accounts') {
            $dbFile = Join-Path $baseDir "accounts.json"
            $response.ContentType = "application/json; charset=utf-8"
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

            if ($request.HttpMethod -eq 'OPTIONS') {
                $response.StatusCode = 200
                $response.OutputStream.Close()
                continue
            }

            if (-not (Test-Path $dbFile)) {
                Set-Content -Path $dbFile -Value "{}" -Encoding UTF8
            }

            if ($request.HttpMethod -eq 'GET') {
                $content = Get-Content -Raw -Encoding UTF8 $dbFile
                if (-not $content) { $content = "{}" }
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                $response.StatusCode = 200
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            elseif ($request.HttpMethod -eq 'POST') {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()

                $currentRaw = Get-Content -Raw -Encoding UTF8 $dbFile
                $currentObj = if ($currentRaw) { $currentRaw | ConvertFrom-Json -AsHashtable } else { @{} }
                if (-not $currentObj) { $currentObj = @{} }

                $postObj = $body | ConvertFrom-Json -AsHashtable
                if ($postObj.username) {
                    $key = $postObj.username.ToLower()
                    $currentObj[$key] = $postObj
                }

                $newRaw = $currentObj | ConvertTo-Json -Depth 10
                Set-Content -Path $dbFile -Value $newRaw -Encoding UTF8

                $resBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            elseif ($request.HttpMethod -eq 'DELETE') {
                $targetUser = $request.QueryString["username"]
                if ($targetUser) {
                    $currentRaw = Get-Content -Raw -Encoding UTF8 $dbFile
                    $currentObj = if ($currentRaw) { $currentRaw | ConvertFrom-Json -AsHashtable } else { @{} }
                    if ($currentObj -and $currentObj.ContainsKey($targetUser.ToLower())) {
                        $currentObj.Remove($targetUser.ToLower())
                        $newRaw = $currentObj | ConvertTo-Json -Depth 10
                        Set-Content -Path $dbFile -Value $newRaw -Encoding UTF8
                    }
                }
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $response.StatusCode = 200
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            }
            $response.OutputStream.Close()
            continue
        }

        $relPath = $urlPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $localPath = Join-Path $baseDir $relPath

        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("Fichier non trouve: $urlPath")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.OutputStream.Close()
    } catch {
        # Client disconnect or stream error
    }
}
