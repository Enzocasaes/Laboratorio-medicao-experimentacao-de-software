# Lab05 Sprint 02 - coleta de uma rede (ProtocoloExperimental.md, secoes 6.5 a 6.7)
#
# Roda o coletor com os parametros fixos da 6.5 e, enquanto ele estiver vivo,
# gera a ficha da rede uma vez por dia (6.6). Executar a partir de Lab5/:
#
#   powershell -ExecutionPolicy Bypass -File Sprint02\coletar_rede.ps1 `
#       -RedeId rede-c -Padrao 192.168.1.1 -Pasta Sprint02\dados\provisoria
#
# Para retomar depois de uma queda (6.7): mesmo -Pasta, e -Rodadas igual ao
# numero de rodadas que faltam ate' o fim da janela de 7 dias.

param(
    [Parameter(Mandatory = $true)][string]$RedeId,
    [Parameter(Mandatory = $true)][string]$Padrao,
    [string]$Pasta = "Sprint02\dados",
    [int]$Rodadas = 336,
    [int]$Intervalo = 1800,
    [string]$Dominios = "",          # vazio = lista de piloto (so' coleta provisoria)
    [string]$Zona = ""               # vazio = modo B
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$python = ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Rode a partir de Lab5/, com a .venv montada (6.1)." }
New-Item -ItemType Directory -Force $Pasta | Out-Null

# caminhos relativos, para o log nao registrar a pasta do usuario (6.5)
$csv = "$Pasta\$RedeId.csv"
$log = "$Pasta\$RedeId.log"

function Write-Ficha {
    $dia = (Get-Date).ToString("yyyyMMdd")
    $ficha = "$Pasta\${RedeId}_ficha_$dia.json"
    if (Test-Path $ficha) { return }
    cmd /c "$python Sprint01\coleta\validar_rede.py --rede-id $RedeId --padrao padrao=$Padrao --saida $ficha >> $log 2>&1"
}

$argumentos = "Sprint01\coleta\coletor.py --rede-id $RedeId --rodadas $Rodadas --intervalo $Intervalo " +
              "--padrao padrao=$Padrao --nomes-c1 10 --nomes-c2 10 --saida $csv"
if ($Dominios) { $argumentos += " --dominios $Dominios" }
if ($Zona) { $argumentos += " --zona $Zona" }

Add-Content -Encoding utf8 $log ("=== inicio {0:yyyy-MM-ddTHH:mm:ssK} rodadas={1} intervalo={2} padrao=padrao (roteador) dominios={3} zona={4}" -f `
    (Get-Date), $Rodadas, $Intervalo, $(if ($Dominios) { $Dominios } else { "piloto" }), $(if ($Zona) { $Zona } else { "-" }))

Write-Ficha

$coletor = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $python $argumentos 2>> $log" `
    -WindowStyle Hidden -PassThru
Add-Content -Encoding utf8 $log "coletor pid=$($coletor.Id)"

# ficha diaria enquanto o coletor roda (6.6)
while (-not $coletor.HasExited) {
    Start-Sleep -Seconds 30
    Write-Ficha
}
Add-Content -Encoding utf8 $log ("=== fim {0:yyyy-MM-ddTHH:mm:ssK} codigo={1}" -f (Get-Date), $coletor.ExitCode)
