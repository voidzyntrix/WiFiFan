# Run by Glow (electron/updater.cjs) right before it quits: swaps in the downloaded exe and starts it.
# Plain ASCII on purpose (Windows PowerShell reads a file without a BOM as ANSI).
param(
  # a JSON file with Old (the Glow that was running), New (the finished download) and Final (where
  # the new Glow goes: the old name, or the new version's name)
  [Parameter(Mandatory = $true)][string]$Job
)

$ErrorActionPreference = 'Stop'
$spec = Get-Content -Raw -Encoding UTF8 -LiteralPath $Job | ConvertFrom-Json
$Old = [string]$spec.Old
$New = [string]$spec.New
$Final = [string]$spec.Final
Remove-Item -LiteralPath $Job -Force -ErrorAction SilentlyContinue
$log = Join-Path $env:TEMP 'glow-update.log'
function Log([string]$m) { Add-Content -Path $log -Value ('{0} {1}' -f (Get-Date -Format s), $m) }
$backup = $Old + '.old'

try {
  Log "update: $Old -> $Final (from $New)"

  # wait until Glow has really exited: its exe can then be opened exclusively
  $deadline = (Get-Date).AddSeconds(90)
  while ($true) {
    try { $f = [IO.File]::Open($Old, 'Open', 'ReadWrite', 'None'); $f.Close(); break }
    catch {
      if ((Get-Date) -gt $deadline) { throw 'the old Glow did not exit' }
      Start-Sleep -Milliseconds 300
    }
  }
  Start-Sleep -Milliseconds 400

  # swap, keeping the old file until the new one is in place
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
  Move-Item -LiteralPath $Old -Destination $backup -Force
  if ((Test-Path -LiteralPath $Final) -and ($Final -ne $Old)) { Remove-Item -LiteralPath $Final -Force }
  Move-Item -LiteralPath $New -Destination $Final -Force
  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue

  # shortcuts (desktop, Start menu, startup, pins) that opened the old file now open the new one
  if ($Old -ne $Final) {
    try {
      $shell = New-Object -ComObject WScript.Shell
      $roots = @(
        [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Startup'),
        (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned')
      )
      foreach ($root in $roots) {
        if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
        Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            $link = $shell.CreateShortcut($_.FullName)
            if ($link.TargetPath -ieq $Old) {
              $link.TargetPath = $Final
              $link.WorkingDirectory = Split-Path -Parent $Final
              $link.Save()
              Log "shortcut: $($_.FullName)"
            }
          } catch { }
        }
      }
    } catch { Log "shortcuts skipped: $_" }
  }

  Log "starting $Final"
  Start-Process -FilePath $Final -WorkingDirectory (Split-Path -Parent $Final)
}
catch {
  Log "failed: $_"
  # put things back and bring the old Glow back up
  if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $Old)) { Move-Item -LiteralPath $backup -Destination $Old -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $New) { Remove-Item -LiteralPath $New -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $Old) { Start-Process -FilePath $Old -WorkingDirectory (Split-Path -Parent $Old) }
}
