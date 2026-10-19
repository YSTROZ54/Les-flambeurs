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

function Convert-PSObjectToHashtable($obj) {
    if ($null -eq $obj) { return $null }
    if ($obj -is [System.Collections.IEnumerable] -and $obj -isnot [string] -and $obj -isnot [System.Collections.IDictionary]) {
        $arr = @()
        foreach ($item in $obj) { $arr += (Convert-PSObjectToHashtable $item) }
        return ,$arr
    }
    if ($obj -is [PSCustomObject] -or $obj -is [System.Management.Automation.PSCustomObject]) {
        $ht = @{}
        foreach ($p in $obj.PSObject.Properties) {
            $ht[$p.Name] = Convert-PSObjectToHashtable $p.Value
        }
        return $ht
    }
    return $obj
}

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
                $currentObj = if ($currentRaw) { Convert-PSObjectToHashtable ($currentRaw | ConvertFrom-Json) } else { @{} }
                if (-not $currentObj) { $currentObj = @{} }

                $postObj = Convert-PSObjectToHashtable ($body | ConvertFrom-Json)
                if ($postObj -and $postObj.username) {
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
                    $currentObj = if ($currentRaw) { Convert-PSObjectToHashtable ($currentRaw | ConvertFrom-Json) } else { @{} }
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

        # ENDPOINT JEU CRASH FUSEE EN LIGNE : /api/crash
        if ($urlPath -eq '/api/crash') {
            $crashFile = Join-Path $baseDir "crash_state.json"
            $response.ContentType = "application/json; charset=utf-8"
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

            if ($request.HttpMethod -eq 'OPTIONS') {
                $response.StatusCode = 200
                $response.OutputStream.Close()
                continue
            }

            # Charger l'état actuel ou l'initialiser
            $currentObj = $null
            if (Test-Path $crashFile) {
                try {
                    $rawContent = Get-Content -Raw -Encoding UTF8 $crashFile
                    if ($rawContent) { $currentObj = Convert-PSObjectToHashtable ($rawContent | ConvertFrom-Json) }
                } catch {}
            }
            if (-not $currentObj) {
                $currentObj = @{
                    id = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    status = "waiting"
                    countdownStartTime = 0
                    countdownDuration = 7000
                    launchTime = 0
                    crashPoint = 2.0
                    crashedAtTime = 0
                    bets = @{}
                    history = @(2.45, 1.35, 4.10, 1.15, 3.20, 1.80)
                    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                }
            }
            if (-not $currentObj.bets) { $currentObj.bets = @{} }

            $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

            # Progression temporelle automatique
            if ($currentObj.status -eq 'countdown') {
                if ($now -ge $currentObj.launchTime -and $currentObj.launchTime -gt 0) {
                    $currentObj.status = 'flying'
                    $currentObj.updatedAt = $now
                }
            }
            elseif ($currentObj.status -eq 'flying') {
                $elapsed = [Math]::Max(0.0, ($now - $currentObj.launchTime) / 1000.0)
                $curMult = [Math]::Pow([Math]::E, 0.15 * $elapsed)
                if ($curMult -ge [double]$currentObj.crashPoint) {
                    $currentObj.status = 'crashed'
                    $currentObj.crashedAtTime = $now
                    $currentObj.updatedAt = $now
                    if (-not $currentObj.history) { $currentObj.history = @() }
                    $newHist = @([Math]::Round([double]$currentObj.crashPoint, 2)) + @($currentObj.history)
                    if ($newHist.Length -gt 8) { $newHist = $newHist[0..7] }
                    $currentObj.history = $newHist
                }
            }
            elseif ($currentObj.status -eq 'crashed') {
                if ($currentObj.crashedAtTime -gt 0 -and ($now - $currentObj.crashedAtTime) -ge 4000) {
                    $currentObj.status = 'waiting'
                    $currentObj.launchTime = 0
                    $currentObj.countdownStartTime = 0
                    $currentObj.crashedAtTime = 0
                    $currentObj.bets = @{}
                    $currentObj.updatedAt = $now
                }
            }

            if ($request.HttpMethod -eq 'POST') {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()

                if ($body) {
                    try {
                        $postObj = Convert-PSObjectToHashtable ($body | ConvertFrom-Json)
                        if ($postObj) {
                            # ACTION 1: PLACER UNE MISE
                            if ($postObj.action -eq 'bet' -and $postObj.bet -and $postObj.bet.name) {
                                $bName = [string]$postObj.bet.name
                                $currentObj.bets[$bName] = @{
                                    name = $bName
                                    bet = [int]$postObj.bet.bet
                                    cashedOut = $false
                                    cashMult = $null
                                    win = 0
                                    avatar = if ($postObj.bet.avatar) { [string]$postObj.bet.avatar } else { "" }
                                }
                                $currentObj.updatedAt = $now
                            }
                            # ACTION 2: ANNULER UNE MISE
                            elseif ($postObj.action -eq 'cancel' -and $postObj.name) {
                                $target = [string]$postObj.name.ToLower().Trim()
                                foreach ($k in @($currentObj.bets.Keys)) {
                                    if ($k.ToLower().Trim() -eq $target) {
                                        $currentObj.bets.Remove($k)
                                        break
                                    }
                                }
                                $currentObj.updatedAt = $now
                            }
                            # ACTION 3: DÉCOLLAGE
                            elseif ($postObj.action -eq 'launch') {
                                if ($currentObj.status -eq 'waiting') {
                                    $currentObj.id = $now
                                    $currentObj.status = 'countdown'
                                    $currentObj.countdownStartTime = $now
                                    $currentObj.countdownDuration = if ($postObj.countdownDuration) { [int]$postObj.countdownDuration } else { 7000 }
                                    $currentObj.launchTime = $now + $currentObj.countdownDuration
                                    $currentObj.crashPoint = if ($postObj.crashPoint) { [double]$postObj.crashPoint } else { [Math]::Round(1.08 + (Get-Random -Minimum 0.1 -Maximum 5.0), 2) }
                                    $currentObj.crashedAtTime = 0
                                    $currentObj.updatedAt = $now

                                    if ($postObj.bet -and $postObj.bet.name) {
                                        $bName = [string]$postObj.bet.name
                                        $currentObj.bets[$bName] = @{
                                            name = $bName
                                            bet = [int]$postObj.bet.bet
                                            cashedOut = $false
                                            cashMult = $null
                                            win = 0
                                            avatar = if ($postObj.bet.avatar) { [string]$postObj.bet.avatar } else { "" }
                                        }
                                    }

                                    foreach ($k in $currentObj.bets.Keys) {
                                        $currentObj.bets[$k].cashedOut = $false
                                        $currentObj.bets[$k].cashMult = $null
                                        $currentObj.bets[$k].win = 0
                                    }
                                }
                            }
                            # ACTION 4: ENCAISSEMENT
                            elseif ($postObj.action -eq 'cashout' -and $postObj.name) {
                                $target = [string]$postObj.name.ToLower().Trim()
                                foreach ($k in $currentObj.bets.Keys) {
                                    if ($k.ToLower().Trim() -eq $target) {
                                        $currentObj.bets[$k].cashedOut = $true
                                        $currentObj.bets[$k].cashMult = [double]$postObj.cashMult
                                        $currentObj.bets[$k].win = [int]$postObj.win
                                        break
                                    }
                                }
                                $currentObj.updatedAt = $now
                            }
                            # FUSION ÉTAT COMPLET DU CLIENT
                            else {
                                if ($postObj.status -eq 'countdown' -and $currentObj.status -eq 'waiting') {
                                    $currentObj.id = if ($postObj.id) { $postObj.id } else { $now }
                                    $currentObj.status = 'countdown'
                                    $currentObj.countdownStartTime = if ($postObj.countdownStartTime) { $postObj.countdownStartTime } else { $now }
                                    $currentObj.countdownDuration = if ($postObj.countdownDuration) { $postObj.countdownDuration } else { 7000 }
                                    $currentObj.launchTime = if ($postObj.launchTime) { $postObj.launchTime } else { $now + 7000 }
                                    $currentObj.crashPoint = if ($postObj.crashPoint) { $postObj.crashPoint } else { 2.0 }
                                    $currentObj.crashedAtTime = 0
                                }

                                if ($postObj.bets -and $postObj.bets.Count -gt 0) {
                                    foreach ($bk in $postObj.bets.Keys) {
                                        $inBet = $postObj.bets[$bk]
                                        if (-not $currentObj.bets.ContainsKey($bk)) {
                                            $currentObj.bets[$bk] = $inBet
                                        } else {
                                            if ($inBet.cashedOut) {
                                                $currentObj.bets[$bk].cashedOut = $true
                                                $currentObj.bets[$bk].cashMult = $inBet.cashMult
                                                $currentObj.bets[$bk].win = $inBet.win
                                            }
                                        }
                                    }
                                }
                                $currentObj.updatedAt = $now
                            }
                        }
                    } catch {}
                }
            }

            # Sauvegarde fichier JSON
            try {
                $newJson = $currentObj | ConvertTo-Json -Depth 6
                Set-Content -Path $crashFile -Value $newJson -Encoding UTF8
            } catch {}

            $outJson = $currentObj | ConvertTo-Json -Depth 6
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($outJson)
            $response.StatusCode = 200
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
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
