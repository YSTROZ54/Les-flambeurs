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

                                    # Seules les mises placées explicitement pour ce vol sont conservées
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
                                if ($postObj.status -eq 'waiting') {
                                    $currentObj.status = 'waiting'
                                    $currentObj.launchTime = 0
                                    $currentObj.countdownStartTime = 0
                                    $currentObj.crashedAtTime = 0
                                    $currentObj.bets = @{}
                                }
                                elseif ($postObj.status -eq 'countdown' -and $currentObj.status -eq 'waiting') {
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

        # ENDPOINT JEU BLACKJACK MULTIJOUEUR EN LIGNE SYNCHRONISE : /api/blackjack
        if ($urlPath -eq '/api/blackjack') {
            $bjFile = Join-Path $baseDir "blackjack_state.json"
            $response.ContentType = "application/json; charset=utf-8"
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type")

            if ($request.HttpMethod -eq 'OPTIONS') {
                $response.StatusCode = 200
                $response.OutputStream.Close()
                continue
            }

            $currentTables = @{}
            if (Test-Path $bjFile) {
                try {
                    $rawContent = Get-Content -Raw -Encoding UTF8 $bjFile
                    if ($rawContent) { $currentTables = Convert-PSObjectToHashtable ($rawContent | ConvertFrom-Json) }
                } catch {}
            }
            if (-not $currentTables) { $currentTables = @{} }

            $actionParam = $request.QueryString["action"]
            if ($actionParam -eq 'list_tables' -or $request.QueryString["list"] -eq 'true') {
                $publicList = @()
                foreach ($num in 1..5) {
                    $pId = "bj_pub_$num"
                    $tbl = if ($currentTables.ContainsKey($pId)) { $currentTables[$pId] } else { @{ tableId = $pId; status = "waiting"; players = @{}; knownPlayers = @{} } }
                    $pArr = @()
                    if ($tbl.players) { foreach ($k in $tbl.players.Keys) { $pArr += @{ username = $tbl.players[$k].username; avatar = $tbl.players[$k].avatar } } }
                    elseif ($tbl.knownPlayers) { foreach ($k in $tbl.knownPlayers.Keys) { $pArr += @{ username = $tbl.knownPlayers[$k].username; avatar = $tbl.knownPlayers[$k].avatar } } }
                    $publicList += @{
                        tableId = $pId
                        status = if ($tbl.status) { $tbl.status } else { "waiting" }
                        playerCount = [Math]::Min(2, $pArr.Length)
                        isFull = ($pArr.Length -ge 2)
                        players = $pArr
                    }
                }
                $privList = @($currentTables.Keys | Where-Object { $_ -notmatch '^bj_pub_[1-5]$' -and $_ -ne 'public' })
                $jsonOut = @{ ok = $true; publicTables = $publicList; activePrivateCount = $privList.Length; maxPrivateTables = 5 } | ConvertTo-Json -Depth 5
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.OutputStream.Close()
                continue
            }

            $tableParam = $request.QueryString["table"]
            if (-not $tableParam) { $tableParam = "bj_pub_1" }
            $tableParam = $tableParam.ToLower().Trim()
            if ($tableParam -eq "public") { $tableParam = "bj_pub_1" }

            if (-not $currentTables.ContainsKey($tableParam)) {
                $currentTables[$tableParam] = @{
                    tableId = $tableParam
                    roundId = 0
                    status = "waiting"
                    dealer = @{ cards = @(); score = 0; hidden = $true }
                    players = @{}
                    playerOrder = @()
                    turn = $null
                    forfeit = $null
                    readyBets = @{}
                    readyPlayers = @{}
                    knownPlayers = @{}
                    host = $null
                    hasPlayedRound = $false
                    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                }
            }

            $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

            # 1. Nettoyage automatique des manches finies depuis plus de 3.2s
            if ($currentTables[$tableParam].status -eq 'finished' -and $currentTables[$tableParam].finishedAt -and ($now - $currentTables[$tableParam].finishedAt -gt 3200)) {
                $prevReadyBets = if ($currentTables[$tableParam].readyBets) { $currentTables[$tableParam].readyBets } else { @{} }
                $prevHost = if ($currentTables[$tableParam].host) { $currentTables[$tableParam].host } else { $null }
                $prevKnown = if ($currentTables[$tableParam].knownPlayers) { $currentTables[$tableParam].knownPlayers } else { @{} }
                $prevReady = if ($currentTables[$tableParam].readyPlayers) { $currentTables[$tableParam].readyPlayers } else { @{} }
                $currentTables[$tableParam] = @{
                    tableId = $tableParam
                    roundId = 0
                    status = "waiting"
                    dealer = @{ cards = @(); score = 0; hidden = $true }
                    players = @{}
                    playerOrder = @()
                    turn = $null
                    forfeit = $null
                    readyBets = $prevReadyBets
                    readyPlayers = @{}
                    knownPlayers = $prevKnown
                    host = $prevHost
                    hasPlayedRound = $true
                    updatedAt = $now
                }
            }
            # 2. Nettoyage / forfait automatique des parties abandonnées en cours (> 30s limite de tour)
            elseif ($currentTables[$tableParam].status -eq 'playing' -or $currentTables[$tableParam].status -eq 'dealer_turn') {
                $timeSinceUpdate = $now - (if ($currentTables[$tableParam].updatedAt) { $currentTables[$tableParam].updatedAt } else { $now })
                if ($timeSinceUpdate -gt 30000) {
                    $activeKeys = @()
                    if ($currentTables[$tableParam].players) {
                        $activeKeys = @($currentTables[$tableParam].players.Keys)
                    }
                    $tKey = if ($currentTables[$tableParam].turn) { [string]$currentTables[$tableParam].turn.ToLower().Trim() } else { "" }
                    $otherKeys = @($activeKeys | Where-Object { $_.ToLower().Trim() -ne $tKey })

                    if ($otherKeys.Length -eq 1 -and $currentTables[$tableParam].players.ContainsKey($tKey)) {
                        $wKey = $otherKeys[0]
                        $winner = $currentTables[$tableParam].players[$wKey]
                        $totalPot = 0
                        foreach ($pk in $currentTables[$tableParam].players.Keys) {
                            $totalPot += [int]$currentTables[$tableParam].players[$pk].bet
                        }
                        $winner.result = "forfeit_win"
                        $winner.payout = $totalPot
                        $currentTables[$tableParam].status = "finished"
                        $currentTables[$tableParam].forfeit = @{
                            loser = $currentTables[$tableParam].players[$tKey].username
                            winner = $winner.username
                            pot = $totalPot
                        }
                        $currentTables[$tableParam].finishedAt = $now
                        $currentTables[$tableParam].updatedAt = $now
                    } else {
                        $currentTables[$tableParam] = @{
                            tableId = $tableParam
                            roundId = 0
                            status = "waiting"
                            dealer = @{ cards = @(); score = 0; hidden = $true }
                            players = @{}
                            playerOrder = @()
                            turn = $null
                            forfeit = $null
                            updatedAt = $now
                        }
                    }
                }
            }

            if ($request.HttpMethod -eq 'POST') {
                $body = ""
                if ($request.ContentLength64 -gt 0) {
                    $buf = New-Object byte[] $request.ContentLength64
                    $offset = 0
                    while ($offset -lt $request.ContentLength64) {
                        $n = $request.InputStream.Read($buf, $offset, $request.ContentLength64 - $offset)
                        if ($n -le 0) { break }
                        $offset += $n
                    }
                    $body = [System.Text.Encoding]::UTF8.GetString($buf, 0, $offset)
                }

                if ($body) {
                    try {
                        $postObj = Convert-PSObjectToHashtable ($body | ConvertFrom-Json)
                        if ($postObj) {
                            if ($postObj.action -eq 'list_tables') {
                                $publicList = @()
                                foreach ($num in 1..5) {
                                    $pId = "bj_pub_$num"
                                    $tbl = if ($currentTables.ContainsKey($pId)) { $currentTables[$pId] } else { @{ tableId = $pId; status = "waiting"; players = @{}; knownPlayers = @{} } }
                                    $pArr = @()
                                    if ($tbl.players) { foreach ($k in $tbl.players.Keys) { $pArr += @{ username = $tbl.players[$k].username; avatar = $tbl.players[$k].avatar } } }
                                    elseif ($tbl.knownPlayers) { foreach ($k in $tbl.knownPlayers.Keys) { $pArr += @{ username = $tbl.knownPlayers[$k].username; avatar = $tbl.knownPlayers[$k].avatar } } }
                                    $publicList += @{
                                        tableId = $pId
                                        status = if ($tbl.status) { $tbl.status } else { "waiting" }
                                        playerCount = [Math]::Min(2, $pArr.Length)
                                        isFull = ($pArr.Length -ge 2)
                                        players = $pArr
                                    }
                                }
                                $privList = @($currentTables.Keys | Where-Object { $_ -notmatch '^bj_pub_[1-5]$' -and $_ -ne 'public' })
                                $jsonOut = @{ ok = $true; publicTables = $publicList; activePrivateCount = $privList.Length; maxPrivateTables = 5 } | ConvertTo-Json -Depth 5
                                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
                                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                                $response.OutputStream.Close()
                                continue
                            }

                            $tId = if ($postObj.tableId) { $postObj.tableId.ToLower().Trim() } else { $tableParam }
                            if ($tId -eq 'public') { $tId = 'bj_pub_1' }
                            if (-not $currentTables.ContainsKey($tId)) {
                                $currentTables[$tId] = @{
                                    tableId = $tId
                                    roundId = 0
                                    status = "waiting"
                                    dealer = @{ cards = @(); score = 0; hidden = $true }
                                    players = @{}
                                    playerOrder = @()
                                    turn = $null
                                    forfeit = $null
                                    updatedAt = $now
                                }
                            }

                            if ($postObj.action -eq 'leave' -and $postObj.username) {
                                $pKey = [string]$postObj.username.ToLower().Trim()
                                $curTable = $currentTables[$tId]
                                if ($curTable.status -eq 'playing' -or $curTable.status -eq 'dealer_turn') {
                                    $remKeys = @()
                                    if ($curTable.players) {
                                        $remKeys = @($curTable.players.Keys | Where-Object { $_.ToLower().Trim() -ne $pKey })
                                    }
                                    if ($remKeys.Length -eq 1) {
                                        $winnerKey = $remKeys[0]
                                        $winner = $curTable.players[$winnerKey]
                                        $totalPot = 0
                                        foreach ($pk in $curTable.players.Keys) {
                                            $totalPot += [int]$curTable.players[$pk].bet
                                        }
                                        $winner.result = 'forfeit_win'
                                        $winner.payout = $totalPot
                                        $curTable.status = 'finished'
                                        $curTable.forfeit = @{
                                            loser = if ($curTable.players.ContainsKey($pKey)) { $curTable.players[$pKey].username } else { $postObj.username }
                                            winner = $winner.username
                                            pot = $totalPot
                                        }
                                        if ($curTable.players.ContainsKey($pKey)) {
                                            $curTable.players.Remove($pKey)
                                        }
                                        $curTable.playerOrder = @($winnerKey)
                                        $curTable.finishedAt = $now
                                        $curTable.updatedAt = $now
                                    } else {
                                        $currentTables[$tId] = @{
                                            tableId = $tId
                                            roundId = 0
                                            status = "waiting"
                                            dealer = @{ cards = @(); score = 0; hidden = $true }
                                            players = @{}
                                            playerOrder = @()
                                            turn = $null
                                            forfeit = $null
                                            updatedAt = $now
                                        }
                                    }
                                } else {
                                    if ($curTable.players -and $curTable.players.ContainsKey($pKey)) {
                                        $curTable.players.Remove($pKey)
                                    }
                                    if ($curTable.players.Count -eq 0) {
                                        $currentTables[$tId] = @{
                                            tableId = $tId
                                            roundId = 0
                                            status = "waiting"
                                            dealer = @{ cards = @(); score = 0; hidden = $true }
                                            players = @{}
                                            playerOrder = @()
                                            turn = $null
                                            forfeit = $null
                                            updatedAt = $now
                                        }
                                    }
                                    $curTable.updatedAt = $now
                                }
                            }
                            # ACTION SET_BET
                            elseif ($postObj.action -eq 'set_bet' -and $postObj.username) {
                                $pKey = [string]$postObj.username.ToLower().Trim()
                                $bVal = [Math]::Max(10, [int]$postObj.bet)
                                $curTable = $currentTables[$tId]
                                if (-not $curTable.readyBets) { $curTable.readyBets = @{} }
                                $curTable.readyBets[$pKey] = $bVal
                                if (-not $curTable.knownPlayers) { $curTable.knownPlayers = @{} }
                                $curTable.knownPlayers[$pKey] = @{ username = $postObj.username; avatar = (if ($postObj.avatar) { $postObj.avatar } else { "👤" }) }
                                if ($postObj.host -and -not $curTable.host) { $curTable.host = [string]$postObj.host.ToLower().Trim() }
                                $curTable.updatedAt = $now
                            }
                            # ACTION SET_READY
                            elseif ($postObj.action -eq 'set_ready' -and $postObj.username) {
                                $pKey = [string]$postObj.username.ToLower().Trim()
                                $bVal = [Math]::Max(10, [int]$postObj.bet)
                                $curTable = $currentTables[$tId]
                                if (-not $curTable.readyBets) { $curTable.readyBets = @{} }
                                $curTable.readyBets[$pKey] = $bVal
                                if (-not $curTable.knownPlayers) { $curTable.knownPlayers = @{} }
                                $curTable.knownPlayers[$pKey] = @{ username = $postObj.username; avatar = (if ($postObj.avatar) { $postObj.avatar } else { "👤" }) }
                                if ($postObj.host -and -not $curTable.host) { $curTable.host = [string]$postObj.host.ToLower().Trim() }

                                if (-not $curTable.readyPlayers) { $curTable.readyPlayers = @{} }
                                if ($postObj.ready -ne $false) {
                                    $curTable.readyPlayers[$pKey] = @{
                                        username = $postObj.username
                                        avatar = (if ($postObj.avatar) { $postObj.avatar } else { "👤" })
                                        bet = $bVal
                                        ready = $true
                                        updatedAt = $now
                                    }
                                } else {
                                    if ($curTable.readyPlayers.ContainsKey($pKey)) { $curTable.readyPlayers.Remove($pKey) }
                                }

                                if ($curTable.status -ne 'playing' -and $curTable.status -ne 'dealer_turn') {
                                    $readyKeys = @($curTable.readyPlayers.Keys | Where-Object { $curTable.readyPlayers[$_].ready -and -not $_.ToLower().Contains('bot') -and -not $_.ToLower().Contains('roxy') })
                                    $isMultiReady = ($readyKeys.Length -ge 2)

                                    if ($isMultiReady) {
                                        # Auto deal entre vrais joueurs réels
                                        $parts = @()
                                        foreach ($rk in $readyKeys) {
                                            $rp = $curTable.readyPlayers[$rk]
                                            $parts += @{ username = $rp.username; avatar = $rp.avatar; bet = $rp.bet }
                                        }

                                        $deck = @()
                                        $suits = @(
                                            @{ s='♠'; color='text-slate-900'; type='suit-black' },
                                            @{ s='♣'; color='text-slate-900'; type='suit-black' },
                                            @{ s='♥'; color='text-red-500'; type='suit-red' },
                                            @{ s='♦'; color='text-red-500'; type='suit-red' }
                                        )
                                        $ranks = @(
                                            @{ r='2'; v=2 }, @{ r='3'; v=3 }, @{ r='4'; v=4 }, @{ r='5'; v=5 },
                                            @{ r='6'; v=6 }, @{ r='7'; v=7 }, @{ r='8'; v=8 }, @{ r='9'; v=9 },
                                            @{ r='10'; v=10 }, @{ r='J'; v=10 }, @{ r='Q'; v=10 }, @{ r='K'; v=10 },
                                            @{ r='A'; v=11 }
                                        )
                                        foreach ($st in $suits) {
                                            foreach ($rk in $ranks) {
                                                $deck += @{ r=$rk.r; v=$rk.v; s=$st.s; color=$st.color; type=$st.type }
                                            }
                                        }
                                        $rnd = New-Object Random
                                        for ($i = $deck.Count - 1; $i -gt 0; $i--) {
                                            $j = $rnd.Next($i + 1)
                                            $tmp = $deck[$i]; $deck[$i] = $deck[$j]; $deck[$j] = $tmp
                                        }

                                        $curTable.roundId = $now
                                        $curTable.tableId = $tId
                                        $curTable.hasPlayedRound = $true
                                        $curTable.readyPlayers = @{}
                                        $c1 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                        $c2 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                        $dScore = if ($c1.r -eq 'A') { 11 } else { [int]$c1.v }
                                        $curTable.dealer = @{ cards = @($c1, $c2); score = $dScore; hidden = $true }
                                        $curTable.players = @{}
                                        $curTable.playerOrder = @()
                                        $curTable.forfeit = $null

                                        foreach ($p in $parts) {
                                            $pk = [string]$p.username.ToLower().Trim()
                                            if (-not $pk) { continue }
                                            $pc1 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                            $pc2 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                            $pScore = [int]$pc1.v + [int]$pc2.v
                                            if ($pc1.r -eq 'A' -and $pc2.r -eq 'A') { $pScore = 12 }
                                            $isBJ = ($pScore -eq 21)
                                            $statusVal = if ($isBJ) { 'blackjack' } else { 'playing' }
                                            $avVal = if ($p.avatar) { $p.avatar } else { "👤" }
                                            $playerBet = if ($p.bet) { [int]$p.bet } else { 100 }

                                            $curTable.players[$pk] = @{
                                                username = $p.username
                                                avatar = $avVal
                                                bet = $playerBet
                                                cards = @($pc1, $pc2)
                                                score = $pScore
                                                status = $statusVal
                                                double = $false
                                                result = $null
                                                payout = 0
                                            }
                                            $curTable.playerOrder += $pk
                                        }
                                        $curTable.deck = $deck

                                        $nxt = $null
                                        foreach ($k in $curTable.playerOrder) {
                                            if ($curTable.players[$k].status -eq 'playing') { $nxt = $k; break }
                                        }
                                        if ($nxt) {
                                            $curTable.turn = $nxt
                                            $curTable.status = 'playing'
                                        } else {
                                            $curTable.turn = 'dealer'
                                            $curTable.status = 'finished'
                                            $curTable.finishedAt = $now
                                        }
                                    }
                                }
                                $curTable.updatedAt = $now
                            }
                            # ACTION DEAL
                            elseif ($postObj.action -eq 'deal') {
                                $curTable = $currentTables[$tId]
                                $pKey = if ($postObj.username) { [string]$postObj.username.ToLower().Trim() } else { "" }
                                if ($postObj.host -and -not $curTable.host) { $curTable.host = [string]$postObj.host.ToLower().Trim() }
                                elseif (-not $curTable.host -and $pKey) { $curTable.host = $pKey }

                                $canDeal = $true
                                if (-not $curTable.hasPlayedRound -and $curTable.roundId -eq 0 -and $curTable.host -and $pKey -ne $curTable.host) {
                                    $canDeal = $false
                                }

                                if ($canDeal -and $curTable.status -ne 'playing' -and $curTable.status -ne 'dealer_turn') {
                                    $curTable.hasPlayedRound = $true
                                    $curTable.readyPlayers = @{}
                                    $deck = @()
                                    $suits = @(
                                        @{ s='♠'; color='text-slate-900'; type='suit-black' },
                                        @{ s='♣'; color='text-slate-900'; type='suit-black' },
                                        @{ s='♥'; color='text-red-500'; type='suit-red' },
                                        @{ s='♦'; color='text-red-500'; type='suit-red' }
                                    )
                                    $ranks = @(
                                        @{ r='2'; v=2 }, @{ r='3'; v=3 }, @{ r='4'; v=4 }, @{ r='5'; v=5 },
                                        @{ r='6'; v=6 }, @{ r='7'; v=7 }, @{ r='8'; v=8 }, @{ r='9'; v=9 },
                                        @{ r='10'; v=10 }, @{ r='J'; v=10 }, @{ r='Q'; v=10 }, @{ r='K'; v=10 },
                                        @{ r='A'; v=11 }
                                    )
                                    foreach ($st in $suits) {
                                        foreach ($rk in $ranks) {
                                            $deck += @{ r=$rk.r; v=$rk.v; s=$st.s; color=$st.color; type=$st.type }
                                        }
                                    }
                                    $rnd = New-Object Random
                                    for ($i = $deck.Count - 1; $i -gt 0; $i--) {
                                        $j = $rnd.Next($i + 1)
                                        $tmp = $deck[$i]; $deck[$i] = $deck[$j]; $deck[$j] = $tmp
                                    }

                                    $parts = if ($postObj.participants -and $postObj.participants.Count -gt 0) { $postObj.participants } else { @(@{ username=$postObj.username; bet=$postObj.bet }) }
                                    
                                    $curTable.roundId = $now
                                    $curTable.tableId = $tId
                                    $c1 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                    $c2 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                    $dScore = if ($c1.r -eq 'A') { 11 } else { [int]$c1.v }
                                    $curTable.dealer = @{ cards = @($c1, $c2); score = $dScore; hidden = $true }
                                    $curTable.players = @{}
                                    $curTable.playerOrder = @()
                                    $curTable.forfeit = $null
                                    
                                    foreach ($p in $parts) {
                                        $pk = [string]$p.username.ToLower().Trim()
                                        if (-not $pk) { continue }
                                        $pc1 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                        $pc2 = $deck[-1]; $deck = $deck[0..($deck.Count - 2)]
                                        $pScore = [int]$pc1.v + [int]$pc2.v
                                        if ($pc1.r -eq 'A' -and $pc2.r -eq 'A') { $pScore = 12 }
                                        $isBJ = ($pScore -eq 21)
                                        $statusVal = if ($isBJ) { 'blackjack' } else { 'playing' }
                                        $avVal = if ($p.avatar) { $p.avatar } else { "👤" }
                                        $recBet = if ($curTable.readyBets -and $curTable.readyBets.ContainsKey($pk)) { [int]$curTable.readyBets[$pk] } else { 100 }
                                        $playerBet = if ($p.bet) { [int]$p.bet } else { $recBet }

                                        $curTable.players[$pk] = @{
                                            username = $p.username
                                            avatar = $avVal
                                            bet = $playerBet
                                            cards = @($pc1, $pc2)
                                            score = $pScore
                                            status = $statusVal
                                            double = $false
                                            result = $null
                                            payout = 0
                                        }
                                        $curTable.playerOrder += $pk
                                    }
                                    $curTable.deck = $deck

                                    $nxt = $null
                                    foreach ($k in $curTable.playerOrder) {
                                        if ($curTable.players[$k].status -eq 'playing') { $nxt = $k; break }
                                    }
                                    if ($nxt) {
                                        $curTable.turn = $nxt
                                        $curTable.status = 'playing'
                                    } else {
                                        $curTable.turn = 'dealer'
                                        $curTable.status = 'finished'
                                        $curTable.finishedAt = $now
                                    }
                                    $curTable.updatedAt = $now
                                }
                            }
                            # ACTION HIT
                            elseif ($postObj.action -eq 'hit' -and $postObj.username) {
                                $pKey = [string]$postObj.username.ToLower().Trim()
                                $curTable = $currentTables[$tId]
                                $cTurn = if ($curTable.turn) { [string]$curTable.turn.ToLower().Trim() } else { "" }
                                if ($curTable.status -eq 'playing' -and $cTurn -eq $pKey -and $curTable.players.ContainsKey($pKey)) {
                                    $p = $curTable.players[$pKey]
                                    if ($p.status -eq 'playing') {
                                        $deck = @($curTable.deck)
                                        if ($deck.Count -gt 0) {
                                            $card = $deck[-1]
                                            $deck = $deck[0..($deck.Count - 2)]
                                            $curTable.deck = $deck
                                            $p.cards += @($card)
                                            
                                            $tot = 0; $aces = 0
                                            foreach ($c in $p.cards) {
                                                if ($c.r -eq 'A') { $aces++; $tot += 11 }
                                                else { $tot += [int]$c.v }
                                            }
                                            while ($tot -gt 21 -and $aces -gt 0) { $tot -= 10; $aces-- }
                                            $p.score = $tot

                                            if ($tot -gt 21) {
                                                $p.status = 'busted'
                                            } elseif ($tot -eq 21) {
                                                $p.status = 'stand'
                                            }

                                            if ($p.status -ne 'playing') {
                                                $nxt = $null
                                                foreach ($k in $curTable.playerOrder) {
                                                    if ($curTable.players[$k].status -eq 'playing') { $nxt = $k; break }
                                                }
                                                if ($nxt) {
                                                    $curTable.turn = $nxt
                                                } else {
                                                    $curTable.turn = 'dealer'
                                                    $curTable.status = 'finished'
                                                    $curTable.finishedAt = $now
                                                }
                                            }
                                            $curTable.updatedAt = $now
                                        }
                                    }
                                }
                            }
                            # ACTION STAND
                            elseif ($postObj.action -eq 'stand' -and $postObj.username) {
                                $pKey = [string]$postObj.username.ToLower().Trim()
                                $curTable = $currentTables[$tId]
                                $cTurn = if ($curTable.turn) { [string]$curTable.turn.ToLower().Trim() } else { "" }
                                if ($curTable.status -eq 'playing' -and $cTurn -eq $pKey -and $curTable.players.ContainsKey($pKey)) {
                                    $p = $curTable.players[$pKey]
                                    $p.status = 'stand'
                                    $nxt = $null
                                    foreach ($k in $curTable.playerOrder) {
                                        if ($curTable.players[$k].status -eq 'playing') { $nxt = $k; break }
                                    }
                                    if ($nxt) {
                                        $curTable.turn = $nxt
                                    } else {
                                        $curTable.turn = 'dealer'
                                        $curTable.status = 'finished'
                                        $curTable.finishedAt = $now
                                    }
                                    $curTable.updatedAt = $now
                                }
                            }
                            elseif ($postObj.tableState) {
                                $currentTables[$tId] = $postObj.tableState
                                $currentTables[$tId].updatedAt = $now
                            } else {
                                foreach ($k in $postObj.Keys) {
                                    $currentTables[$tId][$k] = $postObj[$k]
                                }
                                $currentTables[$tId].updatedAt = $now
                            }
                        }
                    } catch {
                        Write-Host "POST BJ ERROR: $_ ($($_.ScriptStackTrace))"
                    }
                }

                try {
                    $newJson = $currentTables | ConvertTo-Json -Depth 8
                    Set-Content -Path $bjFile -Value $newJson -Encoding UTF8
                } catch {}
            }

            $respTable = if ($tId -and $currentTables.ContainsKey($tId)) { $currentTables[$tId] } else { $currentTables[$tableParam] }
            if ($request.HttpMethod -eq 'POST') {
                $outJson = @{ ok = $true; table = $respTable } | ConvertTo-Json -Depth 8
            } else {
                $outJson = $respTable | ConvertTo-Json -Depth 8
            }
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
